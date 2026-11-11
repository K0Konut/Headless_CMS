import argon2 from 'argon2'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { RetentionService } from '../src/collect/retention.service.js'
import { previewLinks, users } from '../src/db/schema.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()
const server = () => ctx.app.getHttpServer()

function api(method: 'get' | 'post' | 'patch' | 'delete', path: string, cookie: string) {
  return request(server())[method](`/api${path}`).type('json').set('Cookie', cookie)
}

const PROJECTS = {
  slug: 'projets',
  kind: 'collection',
  name: 'Projets',
  entryLabel: 'un projet',
  fields: [
    { key: 'title', label: 'Titre', type: 'text', required: true, translatable: true },
    { key: 'year', label: 'Année', type: 'number', required: false, translatable: false },
  ],
}
const BASE = '/spaces/portfolio/types/projets/entries'

let admin: string

/** Jeton du lien renvoyé par la création d'un aperçu. */
const tokenOf = (url: string) => new URL(url).searchParams.get('dashility-preview')!
const read = (token: string, locale = 'fr') =>
  request(server()).get(`/api/preview/${token}?locale=${locale}`)

async function createEntry(data: object, slug: string) {
  const { body } = await api('post', BASE, admin).expect(201)
  const saved = await api('patch', `${BASE}/${body.id}`, admin)
    .send({ version: body.version, data, slug })
    .expect(200)
  return { id: body.id as string, version: saved.body.version as number }
}

beforeEach(async () => {
  await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
  admin = sessionCookie(
    await request(server())
      .post('/api/auth/login')
      .send({ email: 'admin@exemple.fr', password: PASSWORD })
      .expect(200),
  )
  await api('post', '/spaces', admin)
    .send({ name: 'Portfolio', slug: 'portfolio', siteUrl: 'https://exemple.fr' })
    .expect(201)
  await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(201)
})

describe('URL d’aperçu', () => {
  it('se règle par le super-admin, garde son chemin, et refuse http hors local', async () => {
    await api('patch', '/spaces/portfolio', admin)
      .send({ previewUrl: 'http://exemple.fr/apercu' })
      .expect(400)
    const res = await api('patch', '/spaces/portfolio', admin)
      .send({ previewUrl: 'https://exemple.fr/apercu?x=1' })
      .expect(200)
    expect(res.body.previewUrl).toBe('https://exemple.fr/apercu?x=1')
    const me = await api('get', '/auth/me', admin).expect(200)
    expect(me.body.spaces[0].previewUrl).toBe('https://exemple.fr/apercu?x=1')
    await api('patch', '/spaces/portfolio', admin).send({ previewUrl: null }).expect(200)
  })

  it('sans elle, un aperçu est refusé', async () => {
    const { id } = await createEntry({ title: { fr: 'Brouillon' } }, 'brouillon')
    const res = await api('post', `${BASE}/${id}/preview`, admin).expect(409)
    expect(res.body.error.code).toBe('preview_not_configured')
  })
})

describe('aperçu', () => {
  beforeEach(async () => {
    await api('patch', '/spaces/portfolio', admin)
      .send({ previewUrl: 'https://exemple.fr/apercu?x=1' })
      .expect(200)
  })

  it('montre la version en cours d’un brouillon, sans session et en CORS', async () => {
    const { id } = await createEntry({ title: { fr: 'Mon projet' }, year: 2026 }, 'mon-projet')
    const link = await api('post', `${BASE}/${id}/preview`, admin).expect(201)
    expect(link.body.url).toMatch(/^https:\/\/exemple\.fr\/apercu\?x=1&dashility-preview=/)
    expect(Date.parse(link.body.expiresAt) - Date.now()).toBeGreaterThan(23 * 3600_000)

    const res = await read(tokenOf(link.body.url)).expect(200)
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-robots-tag']).toBe('noindex')
    expect(res.body).toMatchObject({
      type: 'projets',
      kind: 'collection',
      slug: 'mon-projet',
      status: 'draft',
      enComplete: false,
      fields: { title: 'Mon projet', year: 2026 },
    })
  })

  it('renvoie l’anglais même incomplet, et suit les modifications enregistrées', async () => {
    const { id, version } = await createEntry({ title: { fr: 'Titre' } }, 'titre')
    const link = await api('post', `${BASE}/${id}/preview`, admin).expect(201)
    const token = tokenOf(link.body.url)
    expect((await read(token, 'en').expect(200)).body.fields.title).toBeNull()

    await api('patch', `${BASE}/${id}`, admin)
      .send({ version, data: { title: { fr: 'Titre', en: 'Title' } }, slug: 'titre' })
      .expect(200)
    const res = await read(token, 'en').expect(200)
    expect(res.body).toMatchObject({ enComplete: true, fields: { title: 'Title' } })
  })

  it('montre les modifications en attente d’une entrée publiée', async () => {
    const { id, version } = await createEntry({ title: { fr: 'En ligne' } }, 'en-ligne')
    const published = await api('post', `${BASE}/${id}/publish`, admin)
      .send({ version })
      .expect(200)
    await api('patch', `${BASE}/${id}`, admin)
      .send({
        version: published.body.version,
        data: { title: { fr: 'Corrigé' } },
        slug: 'corrige',
      })
      .expect(200)
    const link = await api('post', `${BASE}/${id}/preview`, admin).expect(201)
    const res = await read(tokenOf(link.body.url)).expect(200)
    expect(res.body).toMatchObject({
      status: 'modified',
      slug: 'corrige',
      fields: { title: 'Corrigé' },
    })
  })

  it('distingue un lien invalide, expiré ou dont l’entrée est supprimée', async () => {
    const invalid = await read('essai').expect(404)
    expect(invalid.body.error.code).toBe('preview_not_found')
    expect(invalid.headers['access-control-allow-origin']).toBe('*')

    const { id } = await createEntry({ title: { fr: 'À supprimer' } }, 'a-supprimer')
    const link = await api('post', `${BASE}/${id}/preview`, admin).expect(201)
    const token = tokenOf(link.body.url)
    await api('delete', `${BASE}/${id}`, admin).expect(204)
    expect((await read(token).expect(404)).body.error.code).toBe('preview_entry_deleted')

    const other = await createEntry({ title: { fr: 'Ancien' } }, 'ancien')
    const old = await api('post', `${BASE}/${other.id}/preview`, admin).expect(201)
    await db.update(previewLinks).set({ expiresAt: sql`now() - interval '1 hour'` })
    expect((await read(tokenOf(old.body.url)).expect(410)).body.error.code).toBe('preview_expired')
  })

  it('est ouvert aux membres, pas aux autres espaces', async () => {
    const { id } = await createEntry({ title: { fr: 'Projet' } }, 'projet')
    await db
      .insert(users)
      .values({ email: 'lea@exemple.fr', passwordHash: await argon2.hash(PASSWORD) })
    const member = sessionCookie(
      await request(server())
        .post('/api/auth/login')
        .send({ email: 'lea@exemple.fr', password: PASSWORD })
        .expect(200),
    )
    await api('post', `${BASE}/${id}/preview`, member).expect(404)
    await api('post', '/spaces/portfolio/invitations', admin)
      .send({ email: 'lea@exemple.fr' })
      .expect(201)
    await api('post', `${BASE}/${id}/preview`, member).expect(201)
  })

  it('les liens expirés depuis plus de 7 jours sont purgés', async () => {
    const { id } = await createEntry({ title: { fr: 'Projet' } }, 'projet')
    await api('post', `${BASE}/${id}/preview`, admin).expect(201)
    await api('post', `${BASE}/${id}/preview`, admin).expect(201)
    const [first] = await db.select({ id: previewLinks.id }).from(previewLinks).limit(1)
    await db
      .update(previewLinks)
      .set({ expiresAt: sql`now() - interval '8 days'` })
      .where(sql`${previewLinks.id} = ${first!.id}`)
    await ctx.app.get(RetentionService).purge()
    expect(await db.select().from(previewLinks)).toHaveLength(1)
  })
})
