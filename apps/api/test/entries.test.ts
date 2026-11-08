import argon2 from 'argon2'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { users } from '../src/db/schema.js'
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

  it('refuse des valeurs qui ne correspondent pas au type ; un identifiant pris n’empêche pas d’enregistrer', async () => {
    const first = await api('post', BASE, member).expect(201)
    const second = await api('post', BASE, member).expect(201)
    await api('patch', `${BASE}/${first.body.id}`, member)
      .send({ version: 1, data: { inconnu: 'x' } })
      .expect(400)
    await api('patch', `${BASE}/${first.body.id}`, member)
      .send({ version: 1, data: {}, slug: 'cms' })
      .expect(200)
    // Identifiant déjà pris : le contenu est enregistré, l'identifiant reste l'ancien.
    const duplicate = await api('patch', `${BASE}/${second.body.id}`, member)
      .send({ version: 1, data: { stack: ['Vue'] }, slug: 'cms' })
      .expect(200)
    expect(duplicate.body).toMatchObject({ slug: null, draft: { stack: ['Vue'] }, version: 2 })
    expect(duplicate.body.slugError).toMatch(/déjà utilisé/)
    // « nouveau » n'est réservé que pour les espaces.
    await api('patch', `${BASE}/${second.body.id}`, member)
      .send({ version: 2, data: {}, slug: 'nouveau' })
      .expect(200)
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

  it('un changement de champs fait recharger tous les éditeurs ouverts, même sans valeur effacée', async () => {
    const { body } = await api('post', BASE, member).expect(201)
    await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...PROJECTS, slug: undefined, fields: [title] })
      .expect(200)
    await api('patch', `${BASE}/${body.id}`, member).send({ version: 1, data: {} }).expect(409)
    // Un simple renommage ne dérange personne.
    await api('put', '/spaces/portfolio/types/projets', admin)
      .send({ ...PROJECTS, slug: undefined, name: 'Réalisations', fields: [title] })
      .expect(200)
    await api('patch', `${BASE}/${body.id}`, member).send({ version: 2, data: {} }).expect(200)
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

describe('publication', () => {
  const READY = { title: { fr: 'Ce portfolio', en: 'This portfolio' } }

  /** Entrée de collection enregistrée avec ces valeurs ; renvoie son état. */
  async function entryWith(data: object, slug: string | null = 'ce-portfolio') {
    const { body } = await api('post', BASE, member).expect(201)
    const saved = await api('patch', `${BASE}/${body.id}`, member)
      .send({ version: body.version, data, slug })
      .expect(200)
    return saved.body as { id: string; version: number }
  }
  const act = (id: string, action: string, version: number) =>
    api('post', `${BASE}/${id}/${action}`, member).send({ version })

  it('publie, puis garde les modifications à part jusqu’à « Publier les modifications »', async () => {
    const entry = await entryWith(READY)
    const published = await act(entry.id, 'publish', entry.version).expect(200)
    expect(published.body).toMatchObject({ published: READY, draft: null, enComplete: true })
    expect(published.body.publishedAt).toBeTruthy()

    const changed = { title: { fr: 'Nouveau titre', en: 'This portfolio' } }
    const saved = await api('patch', `${BASE}/${entry.id}`, member)
      .send({ version: published.body.version, data: changed })
      .expect(200)
    expect(saved.body).toMatchObject({ published: READY, draft: changed })
    const list = await api('get', BASE, member).expect(200)
    expect(list.body[0]).toMatchObject({ status: 'modified', title: 'Nouveau titre' })

    const again = await act(entry.id, 'publish', saved.body.version).expect(200)
    expect(again.body).toMatchObject({ published: changed, draft: null })
  })

  it('refuse de publier sans les champs obligatoires en français, et dit lesquels', async () => {
    const entry = await entryWith({ title: { en: 'Only English' } }, null)
    const res = await act(entry.id, 'publish', entry.version).expect(400)
    expect(res.body.error).toMatchObject({
      code: 'publication_invalid',
      issues: [
        { path: 'slug', message: 'Identifiant d’URL obligatoire pour publier' },
        { path: 'title.fr', message: 'Champ obligatoire' },
      ],
    })
    const unchanged = await api('get', `${BASE}/${entry.id}`, member).expect(200)
    expect(unchanged.body.published).toBeNull()
  })

  it('publie une version anglaise incomplète, signalée par « EN incomplet »', async () => {
    const entry = await entryWith({ title: { fr: 'Seulement en français' } })
    const res = await act(entry.id, 'publish', entry.version).expect(200)
    expect(res.body.enComplete).toBe(false)
    const types = await api('get', '/spaces/portfolio/types', member).expect(200)
    expect(types.body[0].counts).toEqual({ total: 1, published: 1, enIncomplete: 1 })
  })

  it('annule les modifications en revenant à la version en ligne', async () => {
    const entry = await entryWith(READY)
    const published = await act(entry.id, 'publish', entry.version).expect(200)
    await act(entry.id, 'discard', published.body.version).expect(400)
    const saved = await api('patch', `${BASE}/${entry.id}`, member)
      .send({ version: published.body.version, data: { title: { fr: 'Brouillon' } } })
      .expect(200)
    const discarded = await act(entry.id, 'discard', saved.body.version).expect(200)
    expect(discarded.body).toMatchObject({ published: READY, draft: null, enComplete: true })
  })

  it('un identifiant d’URL modifié sur une entrée publiée attend « Publier »', async () => {
    const entry = await entryWith(READY)
    const published = await act(entry.id, 'publish', entry.version).expect(200)
    const renamed = await api('patch', `${BASE}/${entry.id}`, member)
      .send({ version: published.body.version, data: READY, slug: 'nouveau-nom' })
      .expect(200)
    // L'adresse en ligne ne change pas : le nouvel identifiant est en attente.
    expect(renamed.body).toMatchObject({ slug: 'ce-portfolio', draftSlug: 'nouveau-nom' })
    // Vider le champ ne retire pas l'adresse en ligne.
    const emptied = await api('patch', `${BASE}/${entry.id}`, member)
      .send({ version: renamed.body.version, data: READY, slug: null })
      .expect(200)
    expect(emptied.body).toMatchObject({ slug: 'ce-portfolio', draftSlug: null })
    const again = await api('patch', `${BASE}/${entry.id}`, member)
      .send({ version: emptied.body.version, data: READY, slug: 'nouveau-nom' })
      .expect(200)
    // Une autre entrée ne peut pas prendre un identifiant en attente.
    const other = await entryWith(READY, null)
    const taken = await api('patch', `${BASE}/${other.id}`, member)
      .send({ version: other.version, data: READY, slug: 'nouveau-nom' })
      .expect(200)
    expect(taken.body.slugError).toMatch(/déjà utilisé/)
    // « Annuler les modifications » rétablit l'identifiant en ligne…
    const discarded = await act(entry.id, 'discard', again.body.version).expect(200)
    expect(discarded.body).toMatchObject({ slug: 'ce-portfolio', draftSlug: null })
    // … et « Publier » met le nouveau en ligne.
    const pending = await api('patch', `${BASE}/${entry.id}`, member)
      .send({ version: discarded.body.version, data: READY, slug: 'nouveau-nom' })
      .expect(200)
    const republished = await act(entry.id, 'publish', pending.body.version).expect(200)
    expect(republished.body).toMatchObject({ slug: 'nouveau-nom', draftSlug: null })
  })

  it('dépublie en gardant le contenu, modifications en attente comprises', async () => {
    const entry = await entryWith(READY)
    const published = await act(entry.id, 'publish', entry.version).expect(200)
    const changed = { title: { fr: 'Modifié' } }
    const saved = await api('patch', `${BASE}/${entry.id}`, member)
      .send({ version: published.body.version, data: changed })
      .expect(200)
    const res = await act(entry.id, 'unpublish', saved.body.version).expect(200)
    expect(res.body).toMatchObject({ published: null, draft: changed })
    await act(entry.id, 'unpublish', res.body.version).expect(400)
  })

  it('refuse une action sur une version périmée', async () => {
    const entry = await entryWith(READY)
    await act(entry.id, 'publish', entry.version - 1).expect(409)
    await act(entry.id, 'inconnue', entry.version).expect(404)
  })

  it('supprime une entrée de collection, jamais une page unique', async () => {
    const entry = await entryWith(READY)
    await api('delete', `${BASE}/${entry.id}`, member).expect(204)
    await api('get', `${BASE}/${entry.id}`, member).expect(404)

    await api('post', '/spaces/portfolio/types', admin)
      .send({ slug: 'cv', kind: 'single', name: 'CV', entryLabel: null, fields: [title] })
      .expect(201)
    await api('delete', '/spaces/portfolio/types/cv/entries/single', member).expect(400)
  })

  it('publie une page unique, sans identifiant d’URL', async () => {
    await api('post', '/spaces/portfolio/types', admin)
      .send({ slug: 'cv', kind: 'single', name: 'CV', entryLabel: null, fields: [title] })
      .expect(201)
    const single = '/spaces/portfolio/types/cv/entries/single'
    const { body } = await api('get', single, member).expect(200)
    const saved = await api('patch', single, member)
      .send({ version: body.version, data: READY })
      .expect(200)
    await api('post', `${single}/publish`, member).send({ version: saved.body.version }).expect(200)
  })
})

describe('texte riche', () => {
  const body = { key: 'body', label: 'Texte', type: 'richtext', required: true, translatable: true }
  const doc = (text: string, marks?: object[]) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(marks && { marks }) }] }],
  })

  it('enregistre un document de l’éditeur et refuse ce qu’il ne produit pas', async () => {
    await api('post', '/spaces/portfolio/types', admin)
      .send({ slug: 'bio', kind: 'single', name: 'Bio', entryLabel: null, fields: [body] })
      .expect(201)
    const url = '/spaces/portfolio/types/bio/entries/single'
    const { body: entry } = await api('get', url, member).expect(200)
    const saved = await api('patch', url, member)
      .send({ version: entry.version, data: { body: { fr: doc('Bonjour', [{ type: 'bold' }]) } } })
      .expect(200)
    expect(saved.body.draft.body.fr.content[0].content[0].text).toBe('Bonjour')

    const evil = doc('clic', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])
    await api('patch', url, member)
      .send({ version: saved.body.version, data: { body: { fr: evil } } })
      .expect(400)

    // Un document sans texte est vide : la publication le refuse.
    const empty = await api('patch', url, member)
      .send({
        version: saved.body.version,
        data: { body: { fr: { type: 'doc', content: [{ type: 'paragraph' }] } } },
      })
      .expect(200)
    const refused = await api('post', `${url}/publish`, member)
      .send({ version: empty.body.version })
      .expect(400)
    expect(refused.body.error.issues).toEqual([{ path: 'body.fr', message: 'Champ obligatoire' }])
  })
})
