import argon2 from 'argon2'
import request from 'supertest'
import sharp from 'sharp'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { users } from '../src/db/schema.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()
const server = () => ctx.app.getHttpServer()

function api(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, cookie: string) {
  return request(server())[method](`/api${path}`).type('json').set('Cookie', cookie)
}
/** Lecture publique, comme le build d'un site. */
const read = (path: string, key: string) =>
  request(server()).get(`/api/v1${path}`).set('Authorization', `Bearer ${key}`)

const PROJECTS = {
  slug: 'projets',
  kind: 'collection',
  name: 'Projets',
  entryLabel: 'un projet',
  fields: [
    { key: 'title', label: 'Titre', type: 'text', required: true, translatable: true },
    {
      key: 'kind',
      label: 'Type',
      type: 'choice',
      required: true,
      translatable: false,
      choices: [{ key: 'perso', fr: 'Projet perso', en: 'Personal project' }],
    },
    { key: 'body', label: 'Contexte', type: 'richtext', required: false, translatable: true },
    { key: 'cover', label: 'Image', type: 'image', required: false, translatable: false },
    {
      key: 'featured',
      label: 'À la une',
      type: 'boolean',
      required: false,
      translatable: false,
      defaultValue: true,
    },
    { key: 'stack', label: 'Stack', type: 'list', required: false, translatable: false },
    {
      key: 'steps',
      label: 'Étapes',
      type: 'group',
      required: false,
      translatable: false,
      fields: [{ key: 'name', label: 'Nom', type: 'text', required: false, translatable: true }],
    },
  ],
}

let admin: string
let key: string

/** Crée une entrée, l'enregistre avec ces valeurs et la publie. */
async function publish(data: object, slug: string) {
  const base = '/spaces/portfolio/types/projets/entries'
  const { body } = await api('post', base, admin).expect(201)
  const saved = await api('patch', `${base}/${body.id}`, admin)
    .send({ version: body.version, data, slug })
    .expect(200)
  await api('post', `${base}/${body.id}/publish`, admin)
    .send({ version: saved.body.version })
    .expect(200)
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
  await api('post', '/spaces', admin)
    .send({ name: 'Portfolio', slug: 'portfolio', siteUrl: 'https://exemple.fr' })
    .expect(201)
  await api('post', '/spaces/portfolio/types', admin).send(PROJECTS).expect(201)
  const res = await api('post', '/spaces/portfolio/api-key', admin).expect(201)
  key = res.body.key
})

describe('clé API', () => {
  it('est renvoyée une seule fois, préfixée, et seule sa date reste visible', async () => {
    expect(key).toMatch(/^dly_[A-Za-z0-9_-]{43}$/)
    const space = await api('get', '/spaces/portfolio', admin).expect(200)
    expect(space.body.apiKeyCreatedAt).toBeTruthy()
    expect(JSON.stringify(space.body)).not.toContain(key)
    expect(space.body.apiKeyHash).toBeUndefined()
  })

  it('refuse une clé absente, invalide ou régénérée', async () => {
    await request(server()).get('/api/v1/content/projets').expect(401)
    await read('/content/projets', 'dly_pas-la-bonne-cle-0000000000').expect(401)
    await read('/content/projets', key).expect(200)
    await api('post', '/spaces/portfolio/api-key', admin).expect(201)
    await read('/content/projets', key).expect(401)
  })

  it('est réservée au super-admin', async () => {
    await db
      .insert(users)
      .values({ email: 'lea@exemple.fr', passwordHash: await argon2.hash(PASSWORD) })
    await api('post', '/spaces/portfolio/invitations', admin)
      .send({ email: 'lea@exemple.fr' })
      .expect(201)
    const member = sessionCookie(
      await request(server())
        .post('/api/auth/login')
        .send({ email: 'lea@exemple.fr', password: PASSWORD })
        .expect(200),
    )
    await api('post', '/spaces/portfolio/api-key', member).expect(403)
    const space = await api('get', '/spaces/portfolio', member).expect(200)
    expect(space.body.apiKeyCreatedAt).toBeUndefined()
  })
})

describe('lecture du contenu publié', () => {
  it('résout chaque champ pour la langue demandée, sans les brouillons', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '<b>' },
            { type: 'text', text: 'important', marks: [{ type: 'highlight' }, { type: 'bold' }] },
          ],
        },
      ],
    }
    await publish(
      {
        title: { fr: 'Ce portfolio', en: 'This portfolio' },
        kind: 'perso',
        body: { fr: doc, en: doc },
        stack: ['Vue'],
        steps: [{ name: { fr: 'Cadrage', en: 'Scoping' } }],
      },
      'ce-portfolio',
    )
    // Un brouillon n'est jamais lu.
    await api('post', '/spaces/portfolio/types/projets/entries', admin).expect(201)

    const fr = await read('/content/projets', key).expect(200)
    expect(fr.body).toHaveLength(1)
    expect(fr.body[0]).toMatchObject({
      slug: 'ce-portfolio',
      fields: {
        title: 'Ce portfolio',
        kind: { key: 'perso', label: 'Projet perso' },
        body: { html: '<p>&lt;b&gt;<strong><mark>important</mark></strong></p>' },
        cover: null,
        featured: true,
        stack: ['Vue'],
        steps: [{ name: 'Cadrage' }],
      },
    })
    expect(fr.body[0].publishedAt).toBeTruthy()

    const en = await read('/content/projets/ce-portfolio?locale=en', key).expect(200)
    expect(en.body.fields).toMatchObject({
      title: 'This portfolio',
      kind: { label: 'Personal project' },
      steps: [{ name: 'Scoping' }],
    })
    await read('/content/projets?locale=de', key).expect(400)
  })

  it('un texte riche sans texte vaut null, comme les autres champs vides', async () => {
    const key = (await api('post', '/spaces/portfolio/api-key', admin).expect(201)).body.key
    const blank = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }],
    }
    await publish(
      { title: { fr: 'Vide', en: 'Empty' }, kind: 'perso', body: { fr: blank, en: blank } },
      'vide',
    )
    const res = await read('/content/projets/vide', key).expect(200)
    expect(res.body.fields.body).toBeNull()
  })

  it('masque en anglais une entrée dont la version anglaise est incomplète', async () => {
    await publish({ title: { fr: 'Complet', en: 'Complete' }, kind: 'perso' }, 'complet')
    await publish({ title: { fr: 'Seulement en français' }, kind: 'perso' }, 'francais')
    const en = await read('/content/projets?locale=en', key).expect(200)
    expect(en.body.map((e: { slug: string }) => e.slug)).toEqual(['complet'])
    await read('/content/projets/francais?locale=en', key).expect(404)
    await read('/content/projets/francais', key).expect(200)
  })

  it('renvoie les images avec leurs variantes en adresses absolues', async () => {
    const image = await sharp({
      create: { width: 1500, height: 500, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer()
    const uploaded = await request(server())
      .post('/api/spaces/portfolio/media')
      .set('Cookie', admin)
      .set('X-Requested-With', 'dashility')
      .attach('file', image, 'capture.png')
      .expect(201)
    const id = uploaded.body.id
    await publish(
      {
        title: { fr: 'Avec image', en: 'With image' },
        kind: 'perso',
        cover: { id, alt: { fr: 'Capture', en: 'Screenshot' } },
      },
      'avec-image',
    )
    const res = await read('/content/projets/avec-image?locale=en', key)
      .set('Host', 'cms.exemple.fr')
      .set('X-Forwarded-Proto', 'https')
      .expect(200)
    const base = `https://cms.exemple.fr/api/media/${id}`
    expect(res.body.fields.cover).toEqual({
      alt: 'Screenshot',
      width: 1500,
      height: 500,
      src: `${base}/1500.webp`,
      srcset: {
        webp: `${base}/640.webp 640w, ${base}/1280.webp 1280w, ${base}/1500.webp 1500w`,
        avif: `${base}/640.avif 640w, ${base}/1280.avif 1280w, ${base}/1500.avif 1500w`,
      },
    })
  })

  it('n’existe pas pour un autre espace, ni pour un type inconnu', async () => {
    await api('post', '/spaces', admin)
      .send({ name: 'Blog', slug: 'blog', siteUrl: 'https://blog.fr' })
      .expect(201)
    const other = (await api('post', '/spaces/blog/api-key', admin).expect(201)).body.key
    await publish({ title: { fr: 'A' }, kind: 'perso' }, 'a')
    await read('/content/projets', other).expect(404)
    await read('/content/inconnu', key).expect(404)
  })

  it('limite à 120 requêtes par minute et par clé', async () => {
    for (let i = 0; i < 120; i++) await read('/content/projets', key).expect(200)
    const res = await read('/content/projets', key).expect(429)
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0)
  })
})

describe('documentation', () => {
  it('décrit l’API de lecture en OpenAPI, sans l’API du dashboard', async () => {
    const res = await request(server()).get('/api/docs-json').expect(200)
    expect(res.body.openapi).toBe('3.1.0')
    expect(Object.keys(res.body.paths)).toEqual([
      '/content/{type}',
      '/content/{type}/{slug}',
      '/featured/{type}',
      '/preview/{token}',
    ])
    const page = await request(server()).get('/api/docs').redirects(1).expect(200)
    expect(page.text).toContain('swagger')
  })
})
