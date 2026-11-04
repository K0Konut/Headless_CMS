import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import argon2 from 'argon2'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { memberships, sessions, spaces, tokens, users } from '../db/schema.js'
import { hashToken, newToken } from './tokens.js'

const RESET_TTL_MS = 24 * 60 * 60 * 1000

/** Liens à usage unique : invitations (créées par SpacesService) et réinitialisations. */
@Injectable()
export class LinksService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private valid(token: string) {
    return and(
      eq(tokens.id, hashToken(token)),
      isNull(tokens.usedAt),
      gt(tokens.expiresAt, new Date()),
    )
  }

  /** Type, email et espace d'un lien valide, pour afficher le formulaire. */
  async describe(token: string) {
    const [link] = await this.db
      .select({
        kind: tokens.kind,
        email: tokens.email,
        spaceSlug: spaces.slug,
        spaceName: spaces.name,
      })
      .from(tokens)
      .leftJoin(spaces, eq(spaces.id, tokens.spaceId))
      .where(this.valid(token))
    if (!link) throw new NotFoundException('Ce lien n’est plus valide')
    const { spaceSlug, spaceName, ...rest } = link
    return { ...rest, space: spaceSlug ? { slug: spaceSlug, name: spaceName } : null }
  }

  /** Consomme le lien et renvoie le compte à connecter. Une invitation crée le compte et
   *  l'ajoute à l'espace ; une réinitialisation change le mot de passe et ferme toutes les
   *  sessions du compte. */
  async consume(token: string, password: string) {
    const passwordHash = await argon2.hash(password)
    return this.db.transaction(async (tx) => {
      // Marquer le lien utilisé d'abord : deux requêtes simultanées ne peuvent pas le consommer.
      const [link] = await tx
        .update(tokens)
        .set({ usedAt: new Date() })
        .where(this.valid(token))
        .returning()
      if (!link) throw new NotFoundException('Ce lien n’est plus valide')

      if (link.kind === 'reset') {
        const [user] = await tx
          .update(users)
          .set({ passwordHash })
          .where(eq(users.id, link.userId!))
          .returning()
        await tx.delete(sessions).where(eq(sessions.userId, link.userId!))
        return user!
      }

      // Le compte a pu être créé depuis l'invitation : on n'écrase jamais son mot de passe.
      const [user] = await tx
        .insert(users)
        .values({ email: link.email, passwordHash })
        .onConflictDoNothing()
        .returning()
      if (!user) {
        throw new ConflictException('Un compte existe déjà pour cet email : connectez-vous')
      }
      await tx.insert(memberships).values({ userId: user.id, spaceId: link.spaceId! })
      return user
    })
  }

  /** Crée un lien de réinitialisation, qui remplace un éventuel lien encore valide. */
  async createReset(userId: string) {
    const [user] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
    if (!user) throw new NotFoundException('Utilisateur introuvable')

    const token = newToken()
    const expiresAt = new Date(Date.now() + RESET_TTL_MS)
    await this.db.transaction(async (tx) => {
      await tx
        .delete(tokens)
        .where(and(eq(tokens.kind, 'reset'), eq(tokens.userId, userId), isNull(tokens.usedAt)))
      await tx
        .insert(tokens)
        .values({ id: hashToken(token), kind: 'reset', email: user.email, userId, expiresAt })
    })
    return { token, expiresAt }
  }
}
