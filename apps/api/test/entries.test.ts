import argon2 from 'argon2'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { users } from '../src/db/schema.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()

function api(method: 'get' | 'post' | 'put' | 'patch', path: string, cookie: string) {
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
const stack = { key: 'stack', label: 'Stack', type: 'list', required: false, translatable: false }
const PROJECTS = {
  slug: 'projets',
  kind: 'collection',
  name: 'Projets',
  entryLabel: 'un projet',
  fields: [title, stack],
}
const BASE = '/spaces/portfolio/types/projets/entries'

let admin: string
let member: string

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

describe('entrées', () => {
  it('un membre crée une entrée, la sauvegarde en brouillon et la retrouve dans la liste', async () => {
    const created = await api('post', BASE, member).expect(201)
    expect(created.body).toMatchObject({
      draft: {},
      published: null,
      version: 1,
      enComplete: false,
    })

    const data = { title: { fr: 'Ce portfolio', en: 'This portfolio' }, stack: ['Vue'] }
    const saved = await api('patch', `${BASE}/${created.body.id}`, member)
      .send({ version: 1, data, slug: 'ce-portfolio' })
      .expect(200)
    expect(saved.body).toMatchObject({
      draft: data,
      slug: 'ce-portfolio',
      version: 2,
      enComplete: true,
    })

    const list = await api('get', BASE, member).expect(200)
    expect(list.body).toEqual([
      expect.objectContaining({ title: 'Ce portfolio', status: 'draft', enComplete: true }),
    ])
    const types = await api('get', '/spaces/portfolio/types', member).expect(200)
    expect(types.body[0].counts).toEqual({ total: 1, published: 0, enIncomplete: 0 })
  })

  it('refuse une version périmée : rien n’est écrasé sans le savoir', async () => {
    const { body } = await api('post', BASE, member).expect(201)
    await api('patch', `${BASE}/${body.id}`, member)
      .send({ version: 1, data: { stack: ['Vue'] } })
      .expect(200)
    const stale = await api('patch', `${BASE}/${body.id}`, admin)
      .send({ version: 1, data: { stack: ['Nuxt'] } })
      .expect(409)
    expect(stale.body.error.message).toMatch(/modifiée ailleurs/)
    const current = await api('get', `${BASE}/${body.id}`, member).expect(200)
    expect(current.body.draft).toEqual({ stack: ['Vue'] })
  })

  it('refuse des valeurs qui ne correspondent pas au type, et un identifiant d’URL en double', async () => {
    const first = await api('post', BASE, member).expect(201)
    const second = await api('post', BASE, member).expect(201)
    await api('patch', `${BASE}/${first.body.id}`, member)
      .send({ version: 1, data: { inconnu: 'x' } })
      .expect(400)
    await api('patch', `${BASE}/${first.body.id}`, member)
      .send({ version: 1, data: {}, slug: 'cms' })
      .expect(200)
    const duplicate = await api('patch', `${BASE}/${second.body.id}`, member)
      .send({ version: 1, data: {}, slug: 'cms' })
      .expect(400)
    expect(duplicate.body.error.message).toMatch(/déjà utilisé/)
  })

  it('une page unique a son entrée dès sa création', async () => {
    await api('post', '/spaces/portfolio/types', admin)
      .send({ slug: 'cv', kind: 'single', name: 'CV', entryLabel: null, fields: [title] })
      .expect(201)
    const entry = await api('get', '/spaces/portfolio/types/cv/entries/single', member).expect(200)
    expect(entry.body).toMatchObject({ slug: null, draft: {}, version: 1 })
    await api('post', '/spaces/portfolio/types/cv/entries', member).expect(400)
    await api('patch', '/spaces/portfolio/types/cv/entries/single', member)
      .send({ version: 1, data: {}, slug: 'cv' })
      .expect(400)
    await api('get', `${BASE}/single`, member).expect(404)
  })

  it('supprimer un champ efface ses valeurs et change la version des entrées touchées', async () => {
    const { body } = await api('post', BASE, member).expect(201)
    await api('patch', `${BASE}/${body.id}`, member)
      .send({ version: 1, data: { title: { fr: 'CMS' }, stack: ['Vue'] } })
      .expect(200)
    await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...PROJECTS, slug: undefined, fields: [title] })
      .expect(200)
    const entry = await api('get', `${BASE}/${body.id}`, member).expect(200)
    expect(entry.body).toMatchObject({ draft: { title: { fr: 'CMS' } }, version: 3 })
  })

  it('n’existe pas hors de son espace ni avec un identifiant mal formé', async () => {
    const { body } = await api('post', BASE, member).expect(201)
    await api('get', `${BASE}/pas-un-uuid`, member).expect(404)
    await api('post', '/spaces', admin)
      .send({ name: 'Blog', slug: 'blog', siteUrl: 'https://blog.fr' })
      .expect(201)
    await api('get', `/spaces/blog/types/projets/entries/${body.id}`, admin).expect(404)
  })
})
