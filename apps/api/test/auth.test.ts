import argon2 from 'argon2'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { memberships, spaces, users } from '../src/db/schema.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()

const login = (email: string, password = PASSWORD) =>
  request(ctx.app.getHttpServer()).post('/api/auth/login').send({ email, password })

describe('connexion', () => {
  it('ouvre une session et pose un cookie sécurisé', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const res = await login('Admin@Exemple.fr').expect(200)

    expect(res.body.user).toMatchObject({ email: 'admin@exemple.fr', isSuperAdmin: true })
    const cookie = [res.headers['set-cookie']].flat().join()
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).toMatch(/SameSite=Strict/)
  })

  it('renvoie la même erreur pour un email inconnu et un mauvais mot de passe', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const wrongPassword = await login('admin@exemple.fr', 'faux').expect(401)
    const unknownEmail = await login('inconnu@exemple.fr').expect(401)
    expect(wrongPassword.body).toEqual(unknownEmail.body)
    expect(wrongPassword.body).toEqual({
      error: { code: 'unauthorized', message: 'Email ou mot de passe incorrect' },
    })
  })

  it('limite à 5 tentatives par minute', async () => {
    for (let i = 0; i < 5; i++) await login('x@exemple.fr', 'faux').expect(401)
    await login('x@exemple.fr', 'faux').expect(429)
  })

  it('compte les variantes d’un même email (espaces, majuscules) ensemble', async () => {
    const res = await login(' X@Exemple.fr ', 'faux').expect(401)
    expect(res.headers['x-ratelimit-remaining-email']).toBe('4')
    const next = await login('x@exemple.fr  ', 'faux').expect(401)
    expect(next.headers['x-ratelimit-remaining-email']).toBe('3')
  })

  it('refuse une requête qui modifie des données sans JSON', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .type('form')
      .send({ email: 'a@b.fr', password: PASSWORD })
      .expect(415, {
        error: { code: 'unsupported_media_type', message: 'Content-Type: application/json requis' },
      })
  })

  it('accepte un Content-Type JSON quelle que soit sa casse', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .set('Content-Type', 'Application/JSON')
      .send(JSON.stringify({ email: 'a@b.fr', password: PASSWORD }))
      .expect(401)
  })
})

describe('session', () => {
  it('exige une session sur les routes protégées', async () => {
    await request(ctx.app.getHttpServer()).get('/api/auth/me').expect(401)
  })

  it('liste tous les espaces au super-admin et ses seuls espaces à un membre', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const [member] = await db
      .insert(users)
      .values({ email: 'membre@exemple.fr', passwordHash: await argon2.hash(PASSWORD) })
      .returning()
    const [a, b] = await db
      .insert(spaces)
      .values([
        { slug: 'a', name: 'A', siteUrl: 'https://a.fr', publicKey: 'pk_a' },
        { slug: 'b', name: 'B', siteUrl: 'https://b.fr', publicKey: 'pk_b' },
      ])
      .returning()
    await db.insert(memberships).values({ userId: member!.id, spaceId: b!.id })

    const admin = sessionCookie(await login('admin@exemple.fr'))
    const memberCookie = sessionCookie(await login('membre@exemple.fr'))
    const server = ctx.app.getHttpServer()

    const adminMe = await request(server).get('/api/auth/me').set('Cookie', admin).expect(200)
    expect(adminMe.body.spaces).toEqual([
      { slug: a!.slug, name: 'A' },
      { slug: b!.slug, name: 'B' },
    ])
    const memberMe = await request(server)
      .get('/api/auth/me')
      .set('Cookie', memberCookie)
      .expect(200)
    expect(memberMe.body).toEqual({
      user: { id: member!.id, email: 'membre@exemple.fr', isSuperAdmin: false },
      spaces: [{ slug: 'b', name: 'B' }],
    })
  })

  it('ferme la session à la déconnexion', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const cookie = sessionCookie(await login('admin@exemple.fr'))
    const server = ctx.app.getHttpServer()

    await request(server).post('/api/auth/logout').set('Cookie', cookie).type('json').expect(204)
    await request(server).get('/api/auth/me').set('Cookie', cookie).expect(401)
  })

  it('efface le cookie à la déconnexion même si la session est déjà fermée', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', 'dashility_session=inconnu')
      .type('json')
      .expect(204)
    expect([res.headers['set-cookie']].flat().join()).toMatch(/dashility_session=;/)
  })

  it('ne réécrit pas le cookie à chaque requête', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const cookie = sessionCookie(await login('admin@exemple.fr'))
    const res = await request(ctx.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200)
    expect(res.headers['set-cookie']).toBeUndefined()
  })
})

describe('changement de mot de passe', () => {
  it('garde la session courante et ferme les autres', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const current = sessionCookie(await login('admin@exemple.fr'))
    const other = sessionCookie(await login('admin@exemple.fr'))
    const server = ctx.app.getHttpServer()

    await request(server)
      .put('/api/auth/password')
      .set('Cookie', current)
      .send({ currentPassword: PASSWORD, newPassword: 'nouveau-mot-de-passe' })
      .expect(204)

    await request(server).get('/api/auth/me').set('Cookie', current).expect(200)
    await request(server).get('/api/auth/me').set('Cookie', other).expect(401)
    await login('admin@exemple.fr', 'nouveau-mot-de-passe').expect(200)
  })

  it('refuse un mot de passe actuel faux ou un nouveau trop court', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const cookie = sessionCookie(await login('admin@exemple.fr'))
    const put = (body: object) =>
      request(ctx.app.getHttpServer()).put('/api/auth/password').set('Cookie', cookie).send(body)

    await put({ currentPassword: 'faux', newPassword: 'nouveau-mot-de-passe' }).expect(400)
    const short = await put({ currentPassword: PASSWORD, newPassword: 'court' }).expect(400)
    expect(short.body.error.code).toBe('validation')
  })
})

describe('commande super-admin', () => {
  it('réinitialise le mot de passe d’un super-admin existant et ferme ses sessions', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const cookie = sessionCookie(await login('admin@exemple.fr'))

    await upsertSuperAdmin(db, 'admin@exemple.fr', 'autre-mot-de-passe')

    await request(ctx.app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401)
    await login('admin@exemple.fr', 'autre-mot-de-passe').expect(200)
  })
})
