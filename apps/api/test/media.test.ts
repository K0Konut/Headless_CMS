import argon2 from 'argon2'
import { eq, sql } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import sharp from 'sharp'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { media, users } from '../src/db/schema.js'
import { MediaService } from '../src/media/media.service.js'
import { mediaPath } from '../src/media/storage.js'
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

/** Envoi d'un fichier comme le dashboard. */
const upload = (cookie: string, buffer: Buffer, name: string, space = 'portfolio') =>
  request(server())
    .post(`/api/spaces/${space}/media`)
    .set('Cookie', cookie)
    .set('X-Requested-With', 'dashility')
    .attach('file', buffer, name)

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#3366aa' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'Lieu secret' } })
    .toBuffer()
const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')

let admin: string
let member: string

beforeEach(async () => {
  await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
  admin = await login('admin@exemple.fr')
  for (const slug of ['portfolio', 'blog']) {
    await api('post', '/spaces', admin)
      .send({ name: slug, slug, siteUrl: `https://${slug}.fr` })
      .expect(201)
  }
  await db
    .insert(users)
    .values({ email: 'lea@exemple.fr', passwordHash: await argon2.hash(PASSWORD) })
  await api('post', '/spaces/portfolio/invitations', admin)
    .send({ email: 'lea@exemple.fr' })
    .expect(201)
  member = await login('lea@exemple.fr')
})

describe('envoi et service des médias', () => {
  it('produit les variantes WebP et AVIF sans agrandir, et les sert en cache permanent', async () => {
    const res = await upload(member, await photo(1500, 600), 'capture.jpg').expect(201)
    expect(res.body).toMatchObject({
      kind: 'image',
      width: 1500,
      height: 600,
      originalName: 'capture.jpg',
    })

    const served = await request(server()).get(`/api/media/${res.body.id}/640.webp`).expect(200)
    expect(served.headers['content-type']).toBe('image/webp')
    expect(served.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect((await sharp(served.body).metadata()).width).toBe(640)
    const largest = await request(server()).get(`/api/media/${res.body.id}/1500.avif`).expect(200)
    expect((await sharp(largest.body).metadata()).width).toBe(1500)

    // Pas d'agrandissement, et l'original (avec ses métadonnées) n'est jamais servi.
    await request(server()).get(`/api/media/${res.body.id}/1920.webp`).expect(404)
    await request(server()).get(`/api/media/${res.body.id}/original.jpg`).expect(404)
    await request(server()).get(`/api/media/${res.body.id}/..%2F..%2Fsecret`).expect(404)
  })

  it('retire les métadonnées EXIF des variantes', async () => {
    const res = await upload(member, await photo(800, 800), 'photo.jpg').expect(201)
    const served = await request(server()).get(`/api/media/${res.body.id}/640.webp`).expect(200)
    expect((await sharp(served.body).metadata()).exif).toBeUndefined()
  })

  it('enregistre un PDF et le sert avec son nom', async () => {
    const res = await upload(member, PDF, 'CV Léa.pdf').expect(201)
    expect(res.body).toMatchObject({ kind: 'pdf', width: null, originalName: 'CV Léa.pdf' })
    const served = await request(server()).get(`/api/media/${res.body.id}/original.pdf`).expect(200)
    expect(served.headers['content-type']).toBe('application/pdf')
    expect(served.headers['content-disposition']).toContain("UTF-8''CV%20L%C3%A9a.pdf")
    const meta = await api('get', `/spaces/portfolio/media/${res.body.id}`, member).expect(200)
    expect(meta.body.bytes).toBe(PDF.length)
  })

  it('vérifie le type réel, la taille et l’en-tête anti-CSRF', async () => {
    await upload(
      member,
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'image.png',
    ).expect(415)
    await upload(member, Buffer.alloc(10 * 1024 * 1024 + 1, 1), 'gros.pdf').expect(413)
    await request(server())
      .post('/api/spaces/portfolio/media')
      .set('Cookie', member)
      .attach('file', PDF, 'cv.pdf')
      .expect(415)
    await upload(member, PDF, 'cv.pdf', 'blog').expect(404)
  })

  it('répond 503 quand le stockage est injoignable', async () => {
    const previous = process.env.MEDIA_DIR
    process.env.MEDIA_DIR = '/dev/null/medias'
    try {
      const res = await upload(member, PDF, 'cv.pdf').expect(503)
      expect(res.body.error.message).toMatch(/stockage des fichiers est indisponible/)
    } finally {
      process.env.MEDIA_DIR = previous
    }
    expect(await db.select().from(media)).toEqual([])
  })
})

describe('médias dans les entrées', () => {
  const FIELDS = [
    { key: 'cover', label: 'Image', type: 'image', required: true, translatable: false },
    { key: 'cv', label: 'CV', type: 'pdf', required: false, translatable: true },
  ]

  async function single() {
    await api('post', '/spaces/portfolio/types', admin)
      .send({ slug: 'accueil', kind: 'single', name: 'Accueil', entryLabel: null, fields: FIELDS })
      .expect(201)
    const url = '/spaces/portfolio/types/accueil/entries/single'
    const { body } = await api('get', url, member).expect(200)
    return { url, version: body.version as number }
  }

  it('accepte un média de l’espace, du bon type, et refuse les autres', async () => {
    const { url, version } = await single()
    const image = (await upload(member, await photo(700, 500), 'a.jpg').expect(201)).body
    const pdf = (await upload(member, PDF, 'cv.pdf').expect(201)).body
    const other = (await upload(admin, PDF, 'autre.pdf', 'blog').expect(201)).body

    const cover = { id: image.id, alt: { fr: 'Capture', en: '' } }
    await api('patch', url, member)
      .send({ version, data: { cover: { ...cover, id: pdf.id } } })
      .expect(400)
    await api('patch', url, member)
      .send({ version, data: { cv: { fr: other.id } } })
      .expect(400)
    const saved = await api('patch', url, member)
      .send({ version, data: { cover, cv: { fr: pdf.id } } })
      .expect(200)
    expect(saved.body.enComplete).toBe(false)

    // Texte alternatif français obligatoire pour publier.
    const noAlt = await api('patch', url, member)
      .send({ version: saved.body.version, data: { cover: { ...cover, alt: { fr: '', en: '' } } } })
      .expect(200)
    const refused = await api('post', `${url}/publish`, member)
      .send({ version: noAlt.body.version })
      .expect(400)
    expect(refused.body.error.issues).toEqual([
      { path: 'cover.alt.fr', message: 'Texte alternatif obligatoire' },
    ])
  })

  it('supprime chaque jour les médias orphelins de plus de 24 h, pas ceux d’une entrée', async () => {
    const { url, version } = await single()
    const used = (await upload(member, PDF, 'garde.pdf').expect(201)).body
    const orphan = (await upload(member, PDF, 'orphelin.pdf').expect(201)).body
    const recent = (await upload(member, PDF, 'recent.pdf').expect(201)).body
    await api('patch', url, member)
      .send({ version, data: { cv: { fr: used.id } } })
      .expect(200)
    await db
      .update(media)
      .set({ createdAt: sql`now() - interval '2 days'` })
      .where(sql`${media.id} in (${used.id}, ${orphan.id})`)

    expect(await ctx.app.get(MediaService).purgeOrphans()).toBe(1)
    const left = await db.select({ id: media.id }).from(media)
    expect(left.map((m) => m.id).sort()).toEqual([used.id, recent.id].sort())
    const [space] = await db
      .execute<{ id: string }>(sql`select id from spaces where slug = 'portfolio'`)
      .then((r) => r.rows)
    expect(existsSync(mediaPath(space!.id, orphan.id))).toBe(false)
    expect(existsSync(mediaPath(space!.id, used.id))).toBe(true)
  })

  it('efface les fichiers d’un espace supprimé', async () => {
    const pdf = (await upload(admin, PDF, 'cv.pdf', 'blog').expect(201)).body
    const [row] = await db.select().from(media).where(eq(media.id, pdf.id))
    await api('delete', '/spaces/blog', admin).expect(204)
    expect(existsSync(mediaPath(row!.spaceId, pdf.id))).toBe(false)
  })
})
