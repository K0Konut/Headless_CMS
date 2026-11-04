import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import type { AddressInfo } from 'node:net'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { events, memberships, spaces, users } from '../src/db/schema.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()
let admin: string
let spaceId: string

const login = async (email: string) =>
  sessionCookie(
    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200),
  )

const get = (path: string, cookie = admin) =>
  request(ctx.app.getHttpServer()).get(`/api/spaces/portfolio${path}`).set('Cookie', cookie)

/** Événement daté précisément (UTC). */
const event = (at: string, kind: 'view' | 'cv', path: string, referrer = '') => ({
  spaceId,
  kind,
  path,
  referrer,
  createdAt: new Date(at),
})

beforeEach(async () => {
  await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
  admin = await login('admin@exemple.fr')
  const [space] = await db
    .insert(spaces)
    .values({
      slug: 'portfolio',
      name: 'Portfolio',
      siteUrl: 'https://exemple.fr',
      publicKey: 'pk',
    })
    .returning()
  spaceId = space!.id
})

describe('GET /spaces/:slug/analytics', () => {
  it('agrège la période par jour, à l’heure de Paris', async () => {
    await db.insert(events).values([
      event('2026-10-14T21:59:00Z', 'view', '/'), // 14 oct. 23 h 59 à Paris
      event('2026-10-15T22:30:00Z', 'view', '/projets/cms', 'www.linkedin.com'), // 16 oct. 0 h 30
      event('2026-10-16T08:00:00Z', 'view', '/projets/cms', 'github.com'),
      event('2026-10-16T08:01:00Z', 'cv', '/projets/cms'),
      event('2026-10-17T22:00:00Z', 'view', '/'), // 18 oct. : hors période
    ])

    const { body } = await get('/analytics?from=2026-10-14&to=2026-10-17').expect(200)

    expect(body.totals).toEqual({ views: 3, cvs: 1 })
    expect(body.daily).toEqual([
      { date: '2026-10-14', views: 1, cvs: 0 },
      { date: '2026-10-15', views: 0, cvs: 0 },
      { date: '2026-10-16', views: 2, cvs: 1 },
      { date: '2026-10-17', views: 0, cvs: 0 },
    ])
    expect(body.pages).toEqual([
      { path: '/projets/cms', views: 2, cvs: 1 },
      { path: '/', views: 1, cvs: 0 },
    ])
    expect(body.hasEvents).toBe(true)
  })

  it('regroupe les provenances', async () => {
    const at = '2026-10-16T08:00:00Z'
    await db.insert(events).values([
      event(at, 'view', '/', 'www.linkedin.com'),
      event(at, 'view', '/', 'lnkd.in'),
      event(at, 'view', '/', 'github.com'),
      event(at, 'view', '/', 'www.google.fr'),
      event(at, 'view', '/', 'www.exemple-blog.fr'),
      event(at, 'view', '/', ''),
      event(at, 'cv', '/', 'linkedin.com'), // les CV ne comptent pas dans les provenances
    ])

    const { body } = await get('/analytics?from=2026-10-16&to=2026-10-16').expect(200)
    expect(body.referrers).toEqual(
      expect.arrayContaining([
        { source: 'LinkedIn', views: 2 },
        { source: 'GitHub', views: 1 },
        { source: 'Google', views: 1 },
        { source: 'exemple-blog.fr', views: 1 },
        { source: 'Accès direct', views: 1 },
      ]),
    )
    expect(body.referrers[0]).toEqual({ source: 'LinkedIn', views: 2 })
    expect(body.referrers).toHaveLength(5)
  })

  it('distingue une période vide d’un espace qui n’a jamais rien reçu', async () => {
    const empty = await get('/analytics?from=2026-10-01&to=2026-10-02').expect(200)
    expect(empty.body).toMatchObject({ totals: { views: 0, cvs: 0 }, hasEvents: false })

    await db.insert(events).values(event('2026-09-01T10:00:00Z', 'view', '/'))
    const quiet = await get('/analytics?from=2026-10-01&to=2026-10-02').expect(200)
    expect(quiet.body).toMatchObject({ totals: { views: 0, cvs: 0 }, hasEvents: true })
  })

  it('refuse une période invalide', async () => {
    await get('/analytics?from=2026-10-31&to=2026-10-01').expect(400)
    await get('/analytics').expect(400)
  })

  it('est réservé aux membres de l’espace', async () => {
    await db
      .insert(users)
      .values({ email: 'autre@exemple.fr', passwordHash: await argon2.hash(PASSWORD) })
    const outsider = await login('autre@exemple.fr')
    await get('/analytics?from=2026-10-01&to=2026-10-02', outsider).expect(404)
    await get('/analytics/export.csv?from=2026-10-01&to=2026-10-02', outsider).expect(404)

    const [user] = await db.select().from(users).where(eq(users.email, 'autre@exemple.fr'))
    await db.insert(memberships).values({ userId: user!.id, spaceId })
    await get('/analytics?from=2026-10-01&to=2026-10-02', outsider).expect(200)
  })
})

describe('export CSV', () => {
  it('liste les événements bruts de la période, champs échappés', async () => {
    await db
      .insert(events)
      .values([
        event('2026-10-16T08:00:00Z', 'view', '/a,b"c', 'github.com'),
        event('2026-10-16T09:00:00Z', 'cv', '/'),
      ])

    const res = await get('/analytics/export.csv?from=2026-10-16&to=2026-10-16').expect(200)
    expect(res.headers['content-type']).toMatch(/^text\/csv/)
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="?analytics-portfolio-2026-10-16-2026-10-16\.csv"?$/,
    )
    expect(res.text).toBe(
      '﻿date,type,page,provenance\r\n' +
        '2026-10-16T08:00:00.000Z,view,"/a,b""c",github.com\r\n' +
        '2026-10-16T09:00:00.000Z,cv,/,\r\n',
    )
  })
})

describe('temps réel', () => {
  it('envoie l’état initial, puis chaque événement collecté', async () => {
    await db.insert(events).values(event(new Date().toISOString(), 'view', '/deja-la'))
    await ctx.app.listen(0)
    const { port } = ctx.app.getHttpServer().address() as AddressInfo
    const base = `http://127.0.0.1:${port}/api`

    const abort = new AbortController()
    const res = await fetch(`${base}/spaces/portfolio/analytics/live`, {
      headers: { Cookie: admin },
      signal: abort.signal,
    })
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/)
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let received = ''
    const readUntil = async (text: string) => {
      while (!received.includes(text)) received += (await reader.read()).value ?? ''
    }

    await readUntil('event: snapshot')
    await readUntil('/deja-la')
    expect(received).toMatch(/"viewTimes":\["[^"]+"\]/)

    await fetch(`${base}/e`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Origin: 'https://exemple.fr',
        'User-Agent': 'Mozilla/5.0 Firefox/140.0',
      },
      body: JSON.stringify({ k: 'pk', t: 'cv', p: '/cv.pdf' }),
    })
    await readUntil('event: event')
    await readUntil('"path":"/cv.pdf"')
    abort.abort()
  })
})
