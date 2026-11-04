import { Inject, Injectable } from '@nestjs/common'
import argon2 from 'argon2'
import { and, asc, eq, gt, lt, ne } from 'drizzle-orm'
import { DB } from '../db/db.module.js'
import type { Db, User } from '../db/index.js'
import { memberships, sessions, spaces, users } from '../db/schema.js'
import { hashToken, newToken } from './tokens.js'

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000
const expiry = () => new Date(Date.now() + SESSION_TTL_MS)

@Injectable()
export class AuthService {
  // Haché une fois : vérifier un email inconnu coûte autant qu'un vrai, sans révéler s'il existe.
  private readonly dummyHash = argon2.hash('dummy-password-for-timing')

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Ouvre une session et renvoie son jeton avec l'utilisateur, ou `null` si les identifiants sont faux. */
  async login(email: string, password: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email))
    const ok = await argon2.verify(user?.passwordHash ?? (await this.dummyHash), password)
    return user && ok ? { user, token: await this.openSession(user.id) } : null
  }

  async openSession(userId: string) {
    await this.db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())))
    const token = newToken()
    await this.db.insert(sessions).values({ id: hashToken(token), userId, expiresAt: expiry() })
    return token
  }

  /** Utilisateur de la session si elle est valide ; la session est alors prolongée. */
  async userFromSession(token: string) {
    const id = hashToken(token)
    const [row] = await this.db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    if (!row) return null
    await this.db.update(sessions).set({ expiresAt: expiry() }).where(eq(sessions.id, id))
    return row.user
  }

  async logout(token: string) {
    await this.db.delete(sessions).where(eq(sessions.id, hashToken(token)))
  }

  /** Change le mot de passe et ferme toutes les autres sessions du compte. */
  async changePassword(user: User, currentToken: string, current: string, next: string) {
    if (!(await argon2.verify(user.passwordHash, current))) return false
    await this.db
      .update(users)
      .set({ passwordHash: await argon2.hash(next) })
      .where(eq(users.id, user.id))
    await this.db
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, hashToken(currentToken))))
    return true
  }

  /** Utilisateur et espaces accessibles : tous pour le super-admin, ses adhésions sinon. */
  async me(user: User) {
    const columns = { slug: spaces.slug, name: spaces.name }
    const userSpaces = user.isSuperAdmin
      ? await this.db.select(columns).from(spaces).orderBy(asc(spaces.name))
      : await this.db
          .select(columns)
          .from(spaces)
          .innerJoin(memberships, eq(memberships.spaceId, spaces.id))
          .where(eq(memberships.userId, user.id))
          .orderBy(asc(spaces.name))
    return {
      user: { id: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin },
      spaces: userSpaces,
    }
  }
}
