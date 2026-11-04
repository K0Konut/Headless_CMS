import { sql } from 'drizzle-orm'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { RetentionService } from '../src/collect/retention.service.js'
import { events, spaces } from '../src/db/schema.js'
import { db, useTestApp } from './helpers.js'

const ctx = useTestApp()
const ORIGIN = 'https://exemple.fr'
const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0'
let spaceId: string

/** Envoi comme `navigator.sendBeacon` : du JSON dans un corps text/plain. */
const beacon = (body: unknown, headers: Record<string, string> = {}) =>
  request(ctx.app.getHttpServer())
    .post('/api/e')
    .set({
      'Content-Type': 'text/plain;charset=UTF-8',
      Origin: ORIGIN,
      'User-Agent': BROWSER,
      ...headers,
    })
    .send(typeof body === 'string' ? body : JSON.stringify(body))

const VIEW = { k: 'pk_test', t: 'view', p: '/projets/cms', r: 'linkedin.com' }

beforeEach(async () => {
  const [space] = await db
    .insert(spaces)
    .values({ slug: 'portfolio', name: 'Portfolio', siteUrl: ORIGIN, publicKey: 'pk_test' })
    .returning()
  spaceId = space!.id
})

describe('collecte', () => {
  it('enregistre une vue et un clic sur le CV', async () => {
    await beacon(VIEW).expect(204)
    await beacon({ k: 'pk_test', t: 'cv', p: '/' }).expect(204)

    const rows = await db.select().from(events).orderBy(events.id)
    expect(rows).toMatchObject([
      { spaceId, kind: 'view', path: '/projets/cms', referrer: 'linkedin.com' },
      { spaceId, kind: 'cv', path: '/', referrer: '' },
    ])
  })

  it.each([
    ['une autre origine', VIEW, { Origin: 'https://pirate.fr' }],
    ['sans origine', VIEW, { Origin: '' }],
    ['une clé inconnue', { ...VIEW, k: 'pk_autre' }, {}],
    ['un robot', VIEW, { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }],
    ['sans User-Agent', VIEW, { 'User-Agent': '' }],
    ['un événement invalide', { ...VIEW, t: 'click' }, {}],
    ['un corps qui n’est pas du JSON', 'pas du json', {}],
  ])('ignore %s, en répondant quand même 204', async (_, body, headers) => {
    await beacon(body, headers).expect(204)
    expect(await db.select().from(events)).toEqual([])
  })

  it('limite à 60 événements par minute et par IP', async () => {
    for (let i = 0; i < 60; i++) await beacon(VIEW).expect(204)
    await beacon(VIEW).expect(429)
  })

  it('ne touche pas au compteur de la connexion', async () => {
    await beacon(VIEW).expect(204)
    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'a@b.fr', password: 'faux' })
    expect(res.headers['x-ratelimit-remaining-ip']).toBe('4')
  })
})

describe('rétention', () => {
  it('supprime les événements de plus de 6 mois', async () => {
    await db.insert(events).values([
      { spaceId, kind: 'view', path: '/ancien', createdAt: sql`now() - interval '7 months'` },
      { spaceId, kind: 'view', path: '/recent', createdAt: sql`now() - interval '5 months'` },
    ])
    await ctx.app.get(RetentionService).purge()
    const rows = await db.select({ path: events.path }).from(events)
    expect(rows).toEqual([{ path: '/recent' }])
  })
})
