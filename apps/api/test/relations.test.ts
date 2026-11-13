import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()
const server = () => ctx.app.getHttpServer()

function api(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) {
  return request(server())[method](`/api${path}`).type('json').set('Cookie', admin)
}
const read = (path: string) =>
  request(server()).get(`/api/v1${path}`).set('Authorization', `Bearer ${key}`)

const title = { key: 'titre', label: 'Titre', type: 'text', required: true, translatable: true }
const cats = {
  key: 'categories',
  label: 'Catégories',
  type: 'relation',
  required: false,
  translatable: false,
  target: 'categories',
  multiple: true,
}
const CATEGORIES = {
  kind: 'collection',
  name: 'Catégories',
  entryLabel: 'une catégorie',
  fields: [title],
}
const PROJECTS = {
  kind: 'collection',
  name: 'Projets',
  entryLabel: 'un projet',
  fields: [title, cats],
}

let admin: string
let key: string

/** Entrée enregistrée avec ces valeurs, publiée si `publish`. */
async function entry(type: string, data: object, slug: string, publish = true) {
  const base = `/spaces/portfolio/types/${type}/entries`
  const { body } = await api('post', base).expect(201)
  const saved = await api('patch', `${base}/${body.id}`)
    .send({ version: body.version, data, slug })
    .expect(200)
  if (publish) {
    await api('post', `${base}/${body.id}/publish`)
      .send({ version: saved.body.version })
      .expect(200)
  }
  return body.id as string
}

beforeEach(async () => {
  await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
  admin = sessionCookie(
    await request(server())
      .post('/api/auth/login')
      .send({ email: 'admin@exemple.fr', password: PASSWORD })
      .expect(200),
  )
  await api('post', '/spaces')
    .send({ name: 'Portfolio', slug: 'portfolio', siteUrl: 'https://exemple.fr' })
    .expect(201)
  await api('post', '/spaces/portfolio/types')
    .send({ slug: 'categories', ...CATEGORIES })
    .expect(201)
  await api('post', '/spaces/portfolio/types')
    .send({ slug: 'projets', ...PROJECTS })
    .expect(201)
  key = (await api('post', '/spaces/portfolio/api-key').expect(201)).body.key
})

describe('champ Relation', () => {
  it('cible une collection de l’espace, puis la garde', async () => {
    const other = { ...PROJECTS, fields: [title, { ...cats, target: 'inconnue' }] }
    await api('post', '/spaces/portfolio/types')
      .send({ slug: 'autres', ...other })
      .expect(400)
    await api('post', '/spaces/portfolio/types')
      .send({ slug: 'cv', kind: 'single', name: 'CV', entryLabel: null, fields: [title] })
      .expect(201)
    const toPage = { ...PROJECTS, fields: [title, { ...cats, target: 'cv' }] }
    await api('post', '/spaces/portfolio/types')
      .send({ slug: 'autres', ...toPage })
      .expect(400)
    // La collection elle-même est une cible possible (« Projets liés »).
    const self = { ...PROJECTS, fields: [title, { ...cats, key: 'lies', target: 'autres' }] }
    await api('post', '/spaces/portfolio/types')
      .send({ slug: 'autres', ...self })
      .expect(201)

    const moved = { ...PROJECTS, fields: [title, { ...cats, target: 'autres' }] }
    const res = await api('put', '/spaces/portfolio/types/projets').send(moved).expect(400)
    expect(res.body.error.message).toMatch(/collection cible/)
  })

  it('ne garde à l’enregistrement que les entrées de la collection cible', async () => {
    const web = await entry('categories', { titre: { fr: 'Web' } }, 'web')
    const project = await entry('projets', { titre: { fr: 'Autre projet' } }, 'autre')
    const id = await entry('projets', { titre: { fr: 'CMS' } }, 'cms', false)
    const unknown = '33333333-3333-4333-8333-333333333333'
    const { body } = await api('get', `/spaces/portfolio/types/projets/entries/${id}`).expect(200)
    const saved = await api('patch', `/spaces/portfolio/types/projets/entries/${id}`)
      .send({
        version: body.version,
        data: { titre: { fr: 'CMS' }, categories: [project, web, unknown, id] },
      })
      .expect(200)
    expect(saved.body.draft.categories).toEqual([web])
  })

  it('renvoie au site l’identifiant et le titre des entrées en ligne', async () => {
    const web = await entry(
      'categories',
      { titre: { fr: 'Développement web', en: 'Web development' } },
      'web',
    )
    const api_ = await entry('categories', { titre: { fr: 'API' } }, 'api') // EN incomplet
    const draft = await entry('categories', { titre: { fr: 'Brouillon' } }, 'brouillon', false)
    const gone = await entry(
      'categories',
      { titre: { fr: 'Supprimée', en: 'Deleted' } },
      'supprimee',
    )
    await entry(
      'projets',
      { titre: { fr: 'CMS', en: 'CMS' }, categories: [web, api_, draft, gone] },
      'cms',
    )
    await api('delete', `/spaces/portfolio/types/categories/entries/${gone}`).expect(204)

    const fr = await read('/content/projets/cms').expect(200)
    expect(fr.body.fields.categories).toEqual([
      { slug: 'web', title: 'Développement web' },
      { slug: 'api', title: 'API' },
    ])
    const en = await read('/content/projets/cms?locale=en').expect(200)
    expect(en.body.fields.categories).toEqual([{ slug: 'web', title: 'Web development' }])
  })

  it('une seule entrée : un objet ou null, et plus de retour à « une seule »', async () => {
    const one = { ...cats, key: 'principale', multiple: false }
    await api('post', '/spaces/portfolio/types')
      .send({ slug: 'vedettes', ...PROJECTS, fields: [title, one] })
      .expect(201)
    const web = await entry('categories', { titre: { fr: 'Web' } }, 'web')
    await entry('vedettes', { titre: { fr: 'Avec' }, principale: [web] }, 'avec')
    await entry('vedettes', { titre: { fr: 'Sans' } }, 'sans')
    expect((await read('/content/vedettes/avec').expect(200)).body.fields.principale).toEqual({
      slug: 'web',
      title: 'Web',
    })
    expect((await read('/content/vedettes/sans').expect(200)).body.fields.principale).toBeNull()

    // « Plusieurs » vers « Une seule » effacerait les entrées qui en citent plusieurs.
    const narrowed = { ...PROJECTS, fields: [title, { ...cats, multiple: false }] }
    const res = await api('put', '/spaces/portfolio/types/projets').send(narrowed).expect(400)
    expect(res.body.error.message).toMatch(/plus passer à une seule/)
  })

  it('liste les entrées qui en citent une, et protège la collection ciblée', async () => {
    const web = await entry('categories', { titre: { fr: 'Web' } }, 'web')
    await entry('projets', { titre: { fr: 'CMS' }, categories: [web] }, 'cms')
    await entry('projets', { titre: { fr: 'Brouillon' }, categories: [web] }, 'brouillon', false)
    await entry('projets', { titre: { fr: 'Sans' } }, 'sans')
    const citing = await api(
      'get',
      `/spaces/portfolio/types/categories/entries/${web}/citations`,
    ).expect(200)
    expect(citing.body.map((c: { title: string }) => c.title).sort()).toEqual(['Brouillon', 'CMS'])

    const refused = await api('delete', '/spaces/portfolio/types/categories').expect(409)
    expect(refused.body.error.code).toBe('type_targeted')
    expect(refused.body.error.message).toMatch(/« Catégories » de Projets/)
  })
})
