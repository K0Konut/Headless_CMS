import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { EntriesService } from '../src/content/entries.service.js'
import { entries, users } from '../src/db/schema.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()

function api(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, cookie: string) {
  return request(ctx.app.getHttpServer())[method](`/api${path}`).type('json').set('Cookie', cookie)
}
const login = async (email: string) =>
  sessionCookie(
    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200),
  )

const title = { key: 'title', label: 'Titre', type: 'text', required: true, translatable: true }
const PROJECTS = {
  slug: 'projets',
  kind: 'collection',
  name: 'Projets',
  entryLabel: 'un projet',
  fields: [title],
}
const BASE = '/spaces/portfolio/types/projets/entries'
const READY = { title: { fr: 'Ce portfolio', en: 'This portfolio' } }
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

let admin: string
let member: string

/** Entrée enregistrée avec ces valeurs ; renvoie son identifiant et sa version. */
async function entryWith(data: object, slug: string | null = 'ce-portfolio') {
  const { body } = await api('post', BASE, member).expect(201)
  const saved = await api('patch', `${BASE}/${body.id}`, member)
    .send({ version: body.version, data, slug })
    .expect(200)
  return saved.body as { id: string; version: number }
}

/** L'heure prévue est passée : la tâche de chaque minute la publie. */
async function runDue(id: string) {
  await db
    .update(entries)
    .set({ scheduledAt: new Date(Date.now() - 1000) })
    .where(eq(entries.id, id))
  await ctx.app.get(EntriesService).publishDue()
  return (await api('get', `${BASE}/${id}`, member).expect(200)).body
}

beforeEach(async () => {
  await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
  admin = await login('admin@exemple.fr')
  await api('post', '/spaces', admin)
    .send({ name: 'Portfolio', slug: 'portfolio', siteUrl: 'https://exemple.fr' })
    .expect(201)
  await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(201)
  await db
    .insert(users)
    .values({ email: 'lea@exemple.fr', passwordHash: await argon2.hash(PASSWORD) })
  await api('post', '/spaces/portfolio/invitations', admin)
    .send({ email: 'lea@exemple.fr' })
    .expect(201)
  member = await login('lea@exemple.fr')
})

describe('publication programmée', () => {
  it('programme une version relue, la fige, puis la publie à l’heure prévue', async () => {
    const entry = await entryWith(READY)
    const at = inHours(24)
    const scheduled = await api('put', `${BASE}/${entry.id}/schedule`, member)
      .send({ version: entry.version, at })
      .expect(200)
    // La version ne change pas : rien n'est réécrit.
    expect(scheduled.body).toMatchObject({
      version: entry.version,
      scheduledAt: expect.any(String),
    })
    expect(new Date(scheduled.body.scheduledAt).toISOString()).toBe(at)

    // Figée : la sauvegarde est refusée tant que la programmation court.
    const refused = await api('patch', `${BASE}/${entry.id}`, member)
      .send({ version: entry.version, data: { title: { fr: 'Autre' } } })
      .expect(409)
    expect(refused.body.error.code).toBe('entry_scheduled')
    const list = await api('get', BASE, member).expect(200)
    expect(list.body[0].scheduledAt).toBeTruthy()
    const types = await api('get', '/spaces/portfolio/types', member).expect(200)
    expect(types.body[0].counts.scheduled).toBe(1)

    const done = await runDue(entry.id)
    expect(done).toMatchObject({
      published: READY,
      draft: null,
      slug: 'ce-portfolio',
      scheduledAt: null,
      lastSchedule: { outcome: 'published' },
    })
    expect(done.version).toBe(entry.version + 1)
  })

  it('refuse une date passée, trop lointaine, ou une entrée incomplète', async () => {
    const entry = await entryWith(READY)
    const schedule = (at: string) =>
      api('put', `${BASE}/${entry.id}/schedule`, member).send({ version: entry.version, at })
    await schedule(new Date(Date.now() + 10_000).toISOString()).expect(400)
    await schedule(inHours(24 * 400)).expect(400)
    const incomplete = await entryWith({}, null)
    const res = await api('put', `${BASE}/${incomplete.id}/schedule`, member)
      .send({ version: incomplete.version, at: inHours(24) })
      .expect(400)
    expect(res.body.error.code).toBe('publication_invalid')
    // Une version périmée n'est pas programmée.
    await api('put', `${BASE}/${entry.id}/schedule`, member)
      .send({ version: entry.version - 1, at: inHours(24) })
      .expect(409)
  })

  it('annuler la programmation rend l’entrée modifiable, sans message', async () => {
    const entry = await entryWith(READY)
    await api('put', `${BASE}/${entry.id}/schedule`, member)
      .send({ version: entry.version, at: inHours(24) })
      .expect(200)
    const cancelled = await api('delete', `${BASE}/${entry.id}/schedule`, member).expect(200)
    expect(cancelled.body).toMatchObject({ scheduledAt: null, lastSchedule: null })
    await api('patch', `${BASE}/${entry.id}`, member)
      .send({ version: entry.version, data: READY })
      .expect(200)
  })

  it('annuler une programmation déjà publiée par la tâche ne l’efface pas (409)', async () => {
    const entry = await entryWith(READY)
    await api('put', `${BASE}/${entry.id}/schedule`, member)
      .send({ version: entry.version, at: inHours(24) })
      .expect(200)
    await runDue(entry.id)
    const late = await api('delete', `${BASE}/${entry.id}/schedule`, member).expect(409)
    expect(late.body.error.code).toBe('not_scheduled')
    const after = (await api('get', `${BASE}/${entry.id}`, member).expect(200)).body
    expect(after.lastSchedule).toMatchObject({ outcome: 'published' })
  })

  it('un changement de structure annule la programmation, avec un message', async () => {
    const entry = await entryWith(READY)
    await api('put', `${BASE}/${entry.id}/schedule`, member)
      .send({ version: entry.version, at: inHours(24) })
      .expect(200)
    await api('put', '/spaces/portfolio/types/projets', admin)
      .send({
        ...PROJECTS,
        slug: undefined,
        fields: [title, { ...title, key: 'sub', label: 'Sous-titre', required: false }],
      })
      .expect(200)
    const after = (await api('get', `${BASE}/${entry.id}`, member).expect(200)).body
    expect(after).toMatchObject({ scheduledAt: null, lastSchedule: { outcome: 'cancelled' } })
    // Rien ne part à l'heure prévue.
    await ctx.app.get(EntriesService).publishDue()
    expect((await api('get', `${BASE}/${entry.id}`, member)).body.published).toBeNull()
  })

  it('publier tout de suite retire la programmation sans message d’annulation', async () => {
    const entry = await entryWith(READY)
    await api('put', `${BASE}/${entry.id}/schedule`, member)
      .send({ version: entry.version, at: inHours(24) })
      .expect(200)
    const published = await api('post', `${BASE}/${entry.id}/publish`, member)
      .send({ version: entry.version })
      .expect(200)
    expect(published.body).toMatchObject({ scheduledAt: null, lastSchedule: null })
  })

  it('refuse à l’heure prévue une publication devenue impossible, sans rien publier', async () => {
    const entry = await entryWith(READY)
    await api('put', `${BASE}/${entry.id}/schedule`, member)
      .send({ version: entry.version, at: inHours(24) })
      .expect(200)
    // L'identifiant en attente de l'entrée est déjà en ligne pour une autre (un cas que l'API
    // empêche à l'enregistrement : on le crée directement en base).
    await entryWith(READY, 'autre')
    await db.update(entries).set({ slug: null, draftSlug: 'autre' }).where(eq(entries.id, entry.id))
    const done = await runDue(entry.id)
    expect(done).toMatchObject({
      published: null,
      scheduledAt: null,
      lastSchedule: { outcome: 'failed', message: expect.stringMatching(/déjà utilisé/) },
    })
  })
})
