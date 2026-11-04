import argon2 from 'argon2'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertSuperAdmin } from '../src/auth/super-admin.js'
import { memberships, tokens, users } from '../src/db/schema.js'
import { PASSWORD, db, sessionCookie, useTestApp } from './helpers.js'

const ctx = useTestApp()
const PORTFOLIO = { name: 'Portfolio', slug: 'portfolio', siteUrl: 'https://exemple.fr/' }

let admin: string

/** Requête JSON, avec le cookie de session si fourni. */
function api(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, cookie?: string) {
  const req = request(ctx.app.getHttpServer())[method](`/api${path}`).type('json')
  return cookie ? req.set('Cookie', cookie) : req
}

const login = async (email: string, password = PASSWORD) =>
  sessionCookie(await api('post', '/auth/login').send({ email, password }).expect(200))

/** Crée un compte membre de l'espace et renvoie son id et son cookie. */
async function addMember(email: string, slug = 'portfolio') {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: await argon2.hash(PASSWORD) })
    .returning()
  await api('post', `/spaces/${slug}/invitations`, admin).send({ email }).expect(201, {
    status: 'added',
  })
  return { id: user!.id, cookie: await login(email) }
}

beforeEach(async () => {
  await upsertSuperAdmin(db, 'admin@exemple.fr', PASSWORD)
  admin = await login('admin@exemple.fr')
  await api('post', '/spaces', admin).send(PORTFOLIO).expect(201)
})

describe('espaces', () => {
  it('crée un espace avec une clé publique et une URL réduite à son origine', async () => {
    const res = await api('get', '/spaces/portfolio', admin).expect(200)
    expect(res.body).toMatchObject({
      name: 'Portfolio',
      slug: 'portfolio',
      siteUrl: 'https://exemple.fr',
    })
    expect(res.body.publicKey).toMatch(/^pk_/)
    expect(res.body.id).toBeUndefined()
  })

  it('refuse un slug déjà pris ou invalide', async () => {
    await api('post', '/spaces', admin).send(PORTFOLIO).expect(409)
    const res = await api('post', '/spaces', admin)
      .send({ ...PORTFOLIO, slug: 'Mon Site' })
      .expect(400)
    expect(res.body.error.code).toBe('validation')
  })

  it('accepte une modification vide sans rien changer', async () => {
    const res = await api('patch', '/spaces/portfolio', admin).send({}).expect(200)
    expect(res.body.slug).toBe('portfolio')
  })

  it('renomme et change le slug', async () => {
    await api('patch', '/spaces/portfolio', admin).send({ slug: 'site' }).expect(200)
    await api('get', '/spaces/site', admin).expect(200)
    await api('get', '/spaces/portfolio', admin).expect(404)
  })

  it('montre l’espace à un membre sans la clé publique, et le cache aux autres', async () => {
    const member = await addMember('membre@exemple.fr')
    await db
      .insert(users)
      .values({ email: 'autre@exemple.fr', passwordHash: await argon2.hash(PASSWORD) })
    const outsider = await login('autre@exemple.fr')

    const res = await api('get', '/spaces/portfolio', member.cookie).expect(200)
    expect(res.body.publicKey).toBeUndefined()
    await api('get', '/spaces', member.cookie).expect(200, [
      { slug: 'portfolio', name: 'Portfolio' },
    ])

    // Un espace inaccessible n'existe pas : 404, comme un espace inconnu.
    await api('get', '/spaces/portfolio', outsider).expect(404)
    await api('get', '/spaces/inconnu', outsider).expect(404)
    await api('get', '/spaces', outsider).expect(200, [])
  })

  it('réserve la gestion au super-admin', async () => {
    const member = await addMember('membre@exemple.fr')
    await api('post', '/spaces', member.cookie)
      .send({ ...PORTFOLIO, slug: 'b' })
      .expect(403)
    await api('patch', '/spaces/portfolio', member.cookie).send({ name: 'X' }).expect(403)
    await api('delete', '/spaces/portfolio', member.cookie).expect(403)
    await api('get', '/spaces/portfolio/members', member.cookie).expect(403)
    await api('post', '/spaces/portfolio/invitations', member.cookie)
      .send({ email: 'a@b.fr' })
      .expect(403)
    await api('post', `/users/${member.id}/password-reset`, member.cookie).expect(403)
  })

  it('supprime l’espace, et ses membres perdent l’accès', async () => {
    const member = await addMember('membre@exemple.fr')
    await api('delete', '/spaces/portfolio', admin).expect(204)
    await api('get', '/spaces', member.cookie).expect(200, [])
    await api('get', '/spaces/portfolio', member.cookie).expect(404)
  })
})

describe('membres et invitations', () => {
  it('invite, puis l’invité choisit son mot de passe et arrive connecté', async () => {
    const invite = await api('post', '/spaces/portfolio/invitations', admin)
      .send({ email: 'Lea@Exemple.fr' })
      .expect(201)
    expect(invite.body.status).toBe('invited')
    const { token } = invite.body

    await api('get', `/tokens/${token}`).expect(200, {
      kind: 'invitation',
      email: 'lea@exemple.fr',
      space: { slug: 'portfolio', name: 'Portfolio' },
    })
    const pending = await api('get', '/spaces/portfolio/members', admin).expect(200)
    expect(pending.body.invitations).toHaveLength(1)

    const accepted = await api('post', `/tokens/${token}`).send({ password: PASSWORD }).expect(200)
    expect(accepted.body.spaces).toEqual([{ slug: 'portfolio', name: 'Portfolio' }])
    await api('get', '/auth/me', sessionCookie(accepted)).expect(200)

    // Usage unique.
    await api('get', `/tokens/${token}`).expect(404)
    await api('post', `/tokens/${token}`).send({ password: PASSWORD }).expect(404)

    const members = await api('get', '/spaces/portfolio/members', admin).expect(200)
    expect(members.body.invitations).toEqual([])
    expect(members.body.members).toMatchObject([{ email: 'lea@exemple.fr' }])
  })

  it('n’affiche pas le super-admin dans la liste des membres', async () => {
    await addMember('membre@exemple.fr')
    const res = await api('get', '/spaces/portfolio/members', admin).expect(200)
    expect(res.body.members.map((m: { email: string }) => m.email)).toEqual(['membre@exemple.fr'])
  })

  it('remplace une invitation en attente pour le même email', async () => {
    const first = await api('post', '/spaces/portfolio/invitations', admin).send({
      email: 'a@b.fr',
    })
    await api('post', '/spaces/portfolio/invitations', admin).send({ email: 'a@b.fr' })
    await api('get', `/tokens/${first.body.token}`).expect(404)
    const res = await api('get', '/spaces/portfolio/members', admin)
    expect(res.body.invitations).toHaveLength(1)
  })

  it('annule une invitation', async () => {
    const invite = await api('post', '/spaces/portfolio/invitations', admin).send({
      email: 'a@b.fr',
    })
    const { body } = await api('get', '/spaces/portfolio/members', admin)
    await api('delete', `/spaces/portfolio/invitations/${body.invitations[0].id}`, admin).expect(
      204,
    )
    await api('get', `/tokens/${invite.body.token}`).expect(404)
    await api('delete', `/spaces/portfolio/invitations/${body.invitations[0].id}`, admin).expect(
      404,
    )
  })

  it('ajoute à l’espace un compte créé entre-temps, sans toucher à son mot de passe', async () => {
    const invite = await api('post', '/spaces/portfolio/invitations', admin).send({
      email: 'a@b.fr',
    })
    await db.insert(users).values({ email: 'a@b.fr', passwordHash: await argon2.hash(PASSWORD) })

    const res = await api('post', `/tokens/${invite.body.token}`)
      .send({ password: 'autre-mot-de-passe' })
      .expect(409)
    expect(res.headers['set-cookie']).toBeUndefined()
    const cookie = await login('a@b.fr')
    await api('get', '/spaces/portfolio', cookie).expect(200)
  })

  it('permet d’accepter des invitations dans plusieurs espaces', async () => {
    await api('post', '/spaces', admin).send({ ...PORTFOLIO, slug: 'blog', name: 'Blog' })
    const a = await api('post', '/spaces/portfolio/invitations', admin).send({ email: 'a@b.fr' })
    const b = await api('post', '/spaces/blog/invitations', admin).send({ email: 'a@b.fr' })

    await api('post', `/tokens/${a.body.token}`).send({ password: PASSWORD }).expect(200)
    await api('post', `/tokens/${b.body.token}`).send({ password: PASSWORD }).expect(409)

    const cookie = await login('a@b.fr')
    await api('get', '/spaces', cookie).expect(200, [
      { slug: 'blog', name: 'Blog' },
      { slug: 'portfolio', name: 'Portfolio' },
    ])
  })

  it('ajoute directement un compte existant et retire son invitation en attente', async () => {
    await api('post', '/spaces/portfolio/invitations', admin).send({ email: 'a@b.fr' })
    await db.insert(users).values({ email: 'a@b.fr', passwordHash: await argon2.hash(PASSWORD) })
    await api('post', '/spaces/portfolio/invitations', admin)
      .send({ email: 'a@b.fr' })
      .expect(201, { status: 'added' })

    const { body } = await api('get', '/spaces/portfolio/members', admin)
    expect(body.invitations).toEqual([])
    expect(body.members).toMatchObject([{ email: 'a@b.fr' }])
  })

  it('n’ajoute pas d’adhésion au super-admin, qui voit déjà tout', async () => {
    await api('post', '/spaces/portfolio/invitations', admin)
      .send({ email: 'admin@exemple.fr' })
      .expect(201, { status: 'added' })
    expect(await db.select().from(memberships)).toEqual([])
  })

  it('ferme la session déjà ouverte dans le navigateur qui accepte un lien', async () => {
    const invite = await api('post', '/spaces/portfolio/invitations', admin).send({
      email: 'a@b.fr',
    })
    await api('post', `/tokens/${invite.body.token}`, admin)
      .send({ password: PASSWORD })
      .expect(200)
    await api('get', '/auth/me', admin).expect(401)
  })

  it('refuse un lien expiré', async () => {
    const invite = await api('post', '/spaces/portfolio/invitations', admin).send({
      email: 'a@b.fr',
    })
    await db.update(tokens).set({ expiresAt: new Date(Date.now() - 1000) })
    await api('get', `/tokens/${invite.body.token}`).expect(404)
  })

  it('retire un membre, qui perd l’accès dès la requête suivante', async () => {
    const member = await addMember('membre@exemple.fr')
    await api('delete', `/spaces/portfolio/members/${member.id}`, admin).expect(204)
    await api('get', '/spaces/portfolio', member.cookie).expect(404)
    await api('delete', `/spaces/portfolio/members/${member.id}`, admin).expect(404)
    await api('delete', '/spaces/portfolio/members/pas-un-uuid', admin).expect(404)
  })
})

describe('réinitialisation du mot de passe', () => {
  it('donne un lien qui change le mot de passe et ferme toutes les sessions', async () => {
    const member = await addMember('membre@exemple.fr')
    const reset = await api('post', `/users/${member.id}/password-reset`, admin).expect(201)

    await api('get', `/tokens/${reset.body.token}`).expect(200, {
      kind: 'reset',
      email: 'membre@exemple.fr',
      space: null,
    })
    const res = await api('post', `/tokens/${reset.body.token}`)
      .send({ password: 'nouveau-mot-de-passe' })
      .expect(200)

    await api('get', '/auth/me', member.cookie).expect(401)
    await api('get', '/auth/me', sessionCookie(res)).expect(200)
    await login('membre@exemple.fr', 'nouveau-mot-de-passe')
  })

  it('invalide le lien précédent quand on en génère un nouveau', async () => {
    const member = await addMember('membre@exemple.fr')
    const first = await api('post', `/users/${member.id}/password-reset`, admin)
    await api('post', `/users/${member.id}/password-reset`, admin)
    await api('get', `/tokens/${first.body.token}`).expect(404)
  })

  it('renvoie 404 pour un utilisateur inconnu', async () => {
    await api('post', '/users/00000000-0000-0000-0000-000000000000/password-reset', admin).expect(
      404,
    )
    await api('post', '/users/inconnu/password-reset', admin).expect(404)
  })

  it('refuse un mot de passe trop court sans consommer le lien', async () => {
    const member = await addMember('membre@exemple.fr')
    const reset = await api('post', `/users/${member.id}/password-reset`, admin)
    await api('post', `/tokens/${reset.body.token}`).send({ password: 'court' }).expect(400)
    await api('get', `/tokens/${reset.body.token}`).expect(200)
  })
})
