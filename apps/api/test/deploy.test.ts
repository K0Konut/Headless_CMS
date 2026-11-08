import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { spaces, users } from '../src/db/schema.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()
const server = () => ctx.app.getHttpServer()

function api(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, cookie: string) {
  return request(server())[method](`/api${path}`).type('json').set('Cookie', cookie)
}
const login = async (email: string) =>
  sessionCookie(
    await request(server()).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200),
  )
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Faux site : enregistre les appels reçus et répond le statut demandé. */
let site: Server
let calls: { headers: Record<string, unknown>; body: unknown }[]
let status = 204
/** Délai de réponse du faux site, pour simuler un build lent à accepter l'appel. */
let slowMs = 0

/** Les tests appellent un serveur local en http ; l'API, elle, n'accepte que https. */
async function useLocalSite(token: string | null = 'jeton-secret') {
  const { port } = site.address() as AddressInfo
  await db
    .update(spaces)
    .set({ deployUrl: `http://127.0.0.1:${port}/hook`, deployToken: token })
    .where(eq(spaces.slug, 'portfolio'))
}

let admin: string
let member: string
const BASE = '/spaces/portfolio/types/projets/entries'

async function publishedEntry(title: string) {
  const { body } = await api('post', BASE, member).expect(201)
  const saved = await api('patch', `${BASE}/${body.id}`, member)
    .send({ version: body.version, data: { title: { fr: title } }, slug: title.toLowerCase() })
    .expect(200)
  const published = await api('post', `${BASE}/${body.id}/publish`, member)
    .send({ version: saved.body.version })
    .expect(200)
  return published.body as { id: string; version: number }
}

beforeEach(async () => {
  calls = []
  status = 204
  slowMs = 0
  site = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      calls.push({ headers: req.headers, body: JSON.parse(raw) })
      setTimeout(() => res.writeHead(status).end(), slowMs)
    })
  })
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))

  await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
  admin = await login('admin@exemple.fr')
  await api('post', '/spaces', admin)
    .send({ name: 'Portfolio', slug: 'portfolio', siteUrl: 'https://exemple.fr' })
    .expect(201)
  await api('post', '/spaces/portfolio/types', admin)
    .send({
      slug: 'projets',
      kind: 'collection',
      name: 'Projets',
      entryLabel: 'un projet',
      fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, translatable: true }],
    })
    .expect(201)
  await db
    .insert(users)
    .values({ email: 'lea@exemple.fr', passwordHash: await argon2.hash(PASSWORD) })
  await api('post', '/spaces/portfolio/invitations', admin)
    .send({ email: 'lea@exemple.fr' })
    .expect(201)
  member = await login('lea@exemple.fr')
})
afterEach(() => new Promise<void>((resolve) => site.close(() => resolve())))

describe('réglages du déploiement', () => {
  it('sont réservés au super-admin, en https, sans jamais renvoyer le jeton', async () => {
    const settings = { url: 'https://api.github.com/repos/moi/site/dispatches', token: 'ghp_x' }
    await api('put', '/spaces/portfolio/deploy', member).send(settings).expect(403)
    const http = await api('put', '/spaces/portfolio/deploy', admin)
      .send({ ...settings, url: 'http://exemple.fr/hook' })
      .expect(400)
    expect(http.body.error.message).toMatch(/https/)

    const saved = await api('put', '/spaces/portfolio/deploy', admin).send(settings).expect(200)
    expect(saved.body).toEqual({
      configured: true,
      pending: false,
      last: null,
      url: settings.url,
      hasToken: true,
    })
    expect(JSON.stringify(saved.body)).not.toContain('ghp_x')
    // Un jeton absent du corps reste tel quel ; une URL nulle retire tout.
    await api('put', '/spaces/portfolio/deploy', admin).send({ url: settings.url }).expect(200)
    expect((await api('get', '/spaces/portfolio/deploy', admin)).body.hasToken).toBe(true)
    const memberView = await api('get', '/spaces/portfolio/deploy', member).expect(200)
    expect(memberView.body).toEqual({ configured: true, pending: false, last: null })
    await api('put', '/spaces/portfolio/deploy', admin).send({ url: null }).expect(200)
    expect((await api('get', '/spaces/portfolio/deploy', admin)).body).toMatchObject({
      configured: false,
      hasToken: false,
    })
  })
})

describe('appel à la publication', () => {
  it('regroupe les publications rapprochées en un seul appel, au format repository_dispatch', async () => {
    await useLocalSite()
    await publishedEntry('A')
    await publishedEntry('B')
    expect((await api('get', '/spaces/portfolio/deploy', member)).body.pending).toBe(true)
    await wait(400)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.body).toEqual({
      event_type: 'dashility-publish',
      client_payload: { space: 'portfolio' },
    })
    expect(calls[0]!.headers.authorization).toBe('Bearer jeton-secret')
    const state = await api('get', '/spaces/portfolio/deploy', member).expect(200)
    expect(state.body).toMatchObject({ pending: false, last: { status: 204, ok: true } })
  })

  it('appelle après une dépublication et la suppression d’une entrée publiée, pas d’un brouillon', async () => {
    await useLocalSite(null)
    const entry = await publishedEntry('A')
    await wait(400)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.headers.authorization).toBeUndefined()

    const draft = (await api('post', BASE, member).expect(201)).body
    await api('delete', `${BASE}/${draft.id}`, member).expect(204)
    await wait(400)
    expect(calls).toHaveLength(1)

    await api('post', `${BASE}/${entry.id}/unpublish`, member)
      .send({ version: entry.version })
      .expect(200)
    await wait(400)
    expect(calls).toHaveLength(2)
    await api('delete', `${BASE}/${entry.id}`, member).expect(204)
    await wait(400)
    expect(calls).toHaveLength(2)
  })

  it('enregistre un échec et un site injoignable, et se relance tout de suite', async () => {
    await useLocalSite()
    status = 500
    const failed = await api('post', '/spaces/portfolio/deploy', member).expect(200)
    expect(failed.body.last).toMatchObject({ status: 500, ok: false })

    await new Promise<void>((resolve) => site.close(() => resolve()))
    const unreachable = await api('post', '/spaces/portfolio/deploy', member).expect(200)
    expect(unreachable.body.last).toMatchObject({ status: null, ok: false })
    site.listen(0, '127.0.0.1')
  })

  it('ne fait rien sans URL de déploiement', async () => {
    await publishedEntry('A')
    await wait(400)
    const state = await api('get', '/spaces/portfolio/deploy', member).expect(200)
    expect(state.body).toEqual({ configured: false, pending: false, last: null })
  })
})

describe('appels qui se croisent', () => {
  it('retirer l’URL pendant l’attente annule l’appel prévu', async () => {
    await useLocalSite()
    await publishedEntry('A')
    await api('put', '/spaces/portfolio/deploy', admin).send({ url: null }).expect(200)
    expect((await api('get', '/spaces/portfolio/deploy', member)).body.pending).toBe(false)
    await wait(400)
    expect(calls).toHaveLength(0)
  })

  it('une demande arrivée pendant un appel en relance un après lui', async () => {
    await useLocalSite()
    slowMs = 300
    // `.then` envoie la requête tout de suite : supertest attend sinon qu'on l'attende.
    const first = api('post', '/spaces/portfolio/deploy', admin)
      .expect(200)
      .then((res) => res)
    await wait(100)
    // Le premier appel est en cours : celle-ci ne doit pas se perdre dans lui.
    await api('post', '/spaces/portfolio/deploy', admin).expect(200)
    await first
    await wait(500)
    expect(calls).toHaveLength(2)
  })
})
