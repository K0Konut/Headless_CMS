import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { setupApp } from '../src/app.setup.js'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { createDb } from '../src/db/index.js'
import { memberships, spaces, users } from '../src/db/schema.js'

const db = createDb()
const PASSWORD = 'motdepasse-solide'
let app: NestExpressApplication

/** Cookie de session posé par une réponse, prêt à renvoyer. Le cookie est `Secure` : un client
 *  HTTP de test ne le renverrait pas de lui-même. */
const sessionCookie = (res: request.Response) =>
  [res.headers['set-cookie']]
    .flat()
    .find((c) => c?.startsWith('cms_session='))!
    .split(';')[0]!

const login = (email: string, password = PASSWORD) =>
  request(app.getHttpServer()).post('/api/auth/login').send({ email, password })

beforeEach(async () => {
  await db.execute(sql`truncate users, spaces cascade`)
  // Une application par test : les compteurs de limitation de débit repartent à zéro.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = setupApp(moduleRef.createNestApplication<NestExpressApplication>())
  await app.init()
})
afterEach(() => app.close())
afterAll(() => db.$client.end())

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

  it('refuse une requête qui modifie des données sans JSON', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .type('form')
      .send({ email: 'a@b.fr', password: PASSWORD })
      .expect(415)
  })
})

describe('session', () => {
  it('exige une session sur les routes protégées', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401)
  })

  it('liste tous les espaces au super-admin et ses seuls espaces à un membre', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const [member] = await db
      .insert(users)
      .values({
        email: 'membre@exemple.fr',
        passwordHash: (await upsertSuperAdmin(db, 'tmp@exemple.fr', PASSWORD)).passwordHash,
      })
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
    const server = app.getHttpServer()

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
    const server = app.getHttpServer()

    await request(server).post('/api/auth/logout').set('Cookie', cookie).type('json').expect(204)
    await request(server).get('/api/auth/me').set('Cookie', cookie).expect(401)
  })
})

describe('changement de mot de passe', () => {
  it('garde la session courante et ferme les autres', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const current = sessionCookie(await login('admin@exemple.fr'))
    const other = sessionCookie(await login('admin@exemple.fr'))
    const server = app.getHttpServer()

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
      request(app.getHttpServer()).put('/api/auth/password').set('Cookie', cookie).send(body)

    await put({ currentPassword: 'faux', newPassword: 'nouveau-mot-de-passe' }).expect(401)
    const short = await put({ currentPassword: PASSWORD, newPassword: 'court' }).expect(400)
    expect(short.body.error.code).toBe('validation')
  })
})

describe('commande super-admin', () => {
  it('réinitialise le mot de passe d’un super-admin existant et ferme ses sessions', async () => {
    await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
    const cookie = sessionCookie(await login('admin@exemple.fr'))

    await upsertSuperAdmin(db, 'admin@exemple.fr', 'autre-mot-de-passe')

    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie).expect(401)
    await login('admin@exemple.fr', 'autre-mot-de-passe').expect(200)
  })
})
