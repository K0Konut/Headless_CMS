import argon2 from 'argon2'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { users } from '../src/db/schema.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()

function api(method: 'get' | 'post' | 'put' | 'delete', path: string, cookie: string) {
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
const CV = { slug: 'cv', kind: 'single', name: 'CV', entryLabel: null, fields: [] }

let admin: string
let member: string

beforeEach(async () => {
  await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
  admin = await login('admin@exemple.fr')
  await api('post', '/spaces', admin)
    .send({ name: 'Portfolio', slug: 'portfolio', siteUrl: 'https://exemple.fr' })
    .expect(201)
  await db
    .insert(users)
    .values({ email: 'lea@exemple.fr', passwordHash: await argon2.hash(PASSWORD) })
  await api('post', '/spaces/portfolio/invitations', admin)
    .send({ email: 'lea@exemple.fr' })
    .expect(201)
  member = await login('lea@exemple.fr')
})

describe('types de contenu', () => {
  it('crée des types, rangés dans l’ordre de création, lisibles par un membre', async () => {
    await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(201)
    await api('post', '/spaces/portfolio/types', admin).send(CV).expect(201)
    const res = await api('get', '/spaces/portfolio/types', member).expect(200)
    expect(res.body.map((t: { slug: string }) => t.slug)).toEqual(['projets', 'cv'])
    expect(res.body[0]).toMatchObject({ ...PROJECTS, position: 0 })
    expect(res.body[0].id).toBeUndefined()
    await api('get', '/spaces/portfolio/types/cv', member).expect(200)
    await api('get', '/spaces/portfolio/types/inconnu', member).expect(404)
  })

  it('réserve la structure au super-admin', async () => {
    await api('post', '/spaces/portfolio/types', member).send(PROJECTS).expect(403)
    await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(201)
    await api('put', '/spaces/portfolio/types/projets', member).send(PROJECTS).expect(403)
    await api('delete', '/spaces/portfolio/types/projets', member).expect(403)
    await api('put', '/spaces/portfolio/type-order', member)
      .send({ slugs: ['projets'] })
      .expect(403)
  })

  it('refuse un identifiant déjà pris dans l’espace, et une définition invalide', async () => {
    await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(201)
    await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(409)
    const res = await api('post', '/spaces/portfolio/types', admin)
      .send({ ...PROJECTS, slug: 'autre', fields: [title, title] })
      .expect(400)
    expect(res.body.error.message).toMatch(/en double/)
  })

  it('modifie noms et champs, mais refuse ce qui est figé', async () => {
    await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(201)
    const update = {
      kind: 'collection',
      name: 'Réalisations',
      entryLabel: 'une réalisation',
      fields: [title],
    }
    const res = await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...update, fields: [{ ...title, label: 'Nom' }] })
      .expect(200)
    expect(res.body).toMatchObject({ slug: 'projets', name: 'Réalisations' })

    const changedType = await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...update, fields: [{ ...title, type: 'richtext' }] })
      .expect(400)
    expect(changedType.body.error.message).toMatch(/ne peut plus changer/)
    const changedKind = await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...update, kind: 'single', entryLabel: null })
      .expect(400)
    expect(changedKind.body.error.message).toMatch(/nature/)
    await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...update, entryLabel: null })
      .expect(400)
  })

  it('supprime un type', async () => {
    await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(201)
    await api('delete', '/spaces/portfolio/types/projets', admin).expect(204)
    await api('delete', '/spaces/portfolio/types/projets', admin).expect(404)
  })

  it('range les types, et refuse un ordre incomplet', async () => {
    await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(201)
    await api('post', '/spaces/portfolio/types', admin).send(CV).expect(201)
    await api('put', '/spaces/portfolio/type-order', admin)
      .send({ slugs: ['cv'] })
      .expect(409)
    await api('put', '/spaces/portfolio/type-order', admin)
      .send({ slugs: ['cv', 'projets'] })
      .expect(204)
    const res = await api('get', '/spaces/portfolio/types', admin).expect(200)
    expect(res.body.map((t: { slug: string }) => t.slug)).toEqual(['cv', 'projets'])
  })

  it('n’existe pas pour un autre espace', async () => {
    await api('post', '/spaces', admin)
      .send({ name: 'Blog', slug: 'blog', siteUrl: 'https://blog.fr' })
      .expect(201)
    await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(201)
    await api('get', '/spaces/blog/types/projets', admin).expect(404)
    await api('get', '/spaces/blog/types', member).expect(404)
  })
})
