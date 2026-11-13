import { eq } from 'drizzle-orm'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { events, spaces } from '../src/db/schema.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()
const server = () => ctx.app.getHttpServer()

function api(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, cookie: string) {
  return request(server())[method](`/api${path}`).type('json').set('Cookie', cookie)
}
const read = (path: string, key: string) =>
  request(server()).get(`/api/v1${path}`).set('Authorization', `Bearer ${key}`)

const FIELDS = [
  { key: 'titre', label: 'Titre', type: 'text', required: true, translatable: true },
  {
    key: 'une',
    label: 'À la une',
    type: 'boolean',
    required: false,
    translatable: false,
    defaultValue: false,
  },
]
const PROJECTS = { slug: 'projets', kind: 'collection', name: 'Projets', entryLabel: 'un projet' }
const FEATURING = {
  paths: { fr: '/fr/projets/{slug}', en: '/en/projects/{slug}' },
  forceField: 'une',
}
const BASE = '/spaces/portfolio/types/projets/entries'

let admin: string
let key: string
let spaceId: string

/** Publie un projet ; `en` à false le laisse incomplet en anglais. */
async function publish(slug: string, { une = false, en = true } = {}) {
  const { body } = await api('post', BASE, admin).expect(201)
  const saved = await api('patch', `${BASE}/${body.id}`, admin)
    .send({
      version: body.version,
      data: { titre: { fr: slug, ...(en && { en: slug }) }, une },
      slug,
    })
    .expect(200)
  await api('post', `${BASE}/${body.id}/publish`, admin)
    .send({ version: saved.body.version })
    .expect(200)
  return body.id as string
}

/** Vues et CV sur la page d'un projet, en français ou en anglais. */
async function visit(path: string, views: number, cv = 0) {
  await db
    .insert(events)
    .values([
      ...Array.from({ length: views }, () => ({ spaceId, kind: 'view' as const, path })),
      ...Array.from({ length: cv }, () => ({ spaceId, kind: 'cv' as const, path })),
    ])
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
  await api('post', '/spaces/portfolio/types', admin)
    .send({ ...PROJECTS, fields: FIELDS })
    .expect(201)
  key = (await api('post', '/spaces/portfolio/api-key', admin).expect(201)).body.key
  spaceId = (
    await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, 'portfolio'))
  )[0]!.id
})

describe('réglages', () => {
  it('se règlent avec le type, et refusent un forçage qui n’est pas oui / non', async () => {
    await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...PROJECTS, fields: FIELDS, featuring: { ...FEATURING, forceField: 'titre' } })
      .expect(400)
    const res = await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...PROJECTS, fields: FIELDS, featuring: FEATURING })
      .expect(200)
    expect(res.body.featuring).toEqual(FEATURING)
    // Un enregistrement qui ne parle pas de mise en avant la garde.
    const kept = await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...PROJECTS, fields: FIELDS })
      .expect(200)
    expect(kept.body.featuring).toEqual(FEATURING)
  })

  it('sans réglage, la route publique répond type_not_featured', async () => {
    const res = await read('/featured/projets', key).expect(404)
    expect(res.body.error.code).toBe('type_not_featured')
  })
})

describe('sélection', () => {
  beforeEach(async () => {
    await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...PROJECTS, fields: FIELDS, featuring: FEATURING })
      .expect(200)
  })

  it('met en avant le forcé, puis les meilleurs taux, en additionnant FR et EN', async () => {
    await publish('force', { une: true })
    await publish('bon')
    await publish('moyen')
    await publish('faible')
    await publish('peu-vu')
    await visit('/fr/projets/bon', 15, 2)
    await visit('/en/projects/bon', 10, 2) // 25 vues, 4 CV : 16 %
    await visit('/fr/projets/moyen', 30, 2)
    await visit('/fr/projets/moyen/', 20, 2) // 50 vues, 4 CV : 8 %, barre finale comprise
    await visit('/fr/projets/faible', 100, 1) // 1 %
    await visit('/fr/projets/peu-vu', 10, 5) // sous le seuil
    await visit('/fr/projets', 500, 50) // page de liste : comptée nulle part

    const res = await read('/featured/projets', key).expect(200)
    expect(res.body.map((e: { slug: string; featured: string }) => [e.slug, e.featured])).toEqual([
      ['force', 'forced'],
      ['bon', 'ranked'],
      ['moyen', 'ranked'],
    ])
    expect(res.body[0].fields.titre).toBe('force')

    const summary = await api('get', '/spaces/portfolio/analytics/featured', admin).expect(200)
    const rows = summary.body[0].rows
    expect(summary.body[0].type).toEqual({ slug: 'projets', name: 'Projets' })
    expect(summary.body[0].drawnPlaces).toBe(0)
    expect(rows.map((r: { title: string }) => r.title)).toEqual([
      'force',
      'bon',
      'moyen',
      'faible',
      'peu-vu',
    ])
    expect(rows[1]).toMatchObject({ views: 25, cv: 4, score: 0.16, rank: 1, featured: true })
    expect(rows[3]).toMatchObject({ rank: 3, featured: false })
    expect(rows[4]).toMatchObject({ score: null, rank: null, featured: false })
  })

  it('tire les places restantes, les mêmes dans les deux langues', async () => {
    for (const slug of ['a', 'b', 'c', 'd', 'e']) await publish(slug)
    const fr = await read('/featured/projets?locale=fr', key).expect(200)
    const en = await read('/featured/projets?locale=en', key).expect(200)
    expect(fr.body).toHaveLength(3)
    expect(fr.body.every((e: { featured: string }) => e.featured === 'drawn')).toBe(true)
    expect(en.body.map((e: { slug: string }) => e.slug)).toEqual(
      fr.body.map((e: { slug: string }) => e.slug),
    )
    const summary = await api('get', '/spaces/portfolio/analytics/featured', admin).expect(200)
    expect(summary.body[0].drawnPlaces).toBe(3)
  })

  it('ignore une entrée de la corbeille, même forcée', async () => {
    const id = await publish('supprime', { une: true })
    await publish('garde')
    await api('delete', `${BASE}/${id}`, admin).expect(204)
    const fr = await read('/featured/projets', key).expect(200)
    expect(fr.body.map((e: { slug: string }) => e.slug)).toEqual(['garde'])
  })

  it('en anglais, saute une entrée incomplète', async () => {
    await publish('sans-anglais', { une: true, en: false })
    await publish('complet')
    const en = await read('/featured/projets?locale=en', key).expect(200)
    expect(en.body.map((e: { slug: string }) => e.slug)).toEqual(['complet'])
    const fr = await read('/featured/projets', key).expect(200)
    expect(fr.body.map((e: { slug: string }) => e.slug)).toEqual(['sans-anglais', 'complet'])
  })
})
