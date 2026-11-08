import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import { hashToken, newToken } from '../auth/tokens.js'
import { generateApiKey } from '../public-api/api-key.js'
import { removeMediaDir } from '../media/storage.js'
import { DB } from '../db/db.module.js'
import { isUniqueViolation } from '../db/errors.js'
import type { Db } from '../db/index.js'
import { memberships, spaces, tokens, users } from '../db/schema.js'
import { type Space, spaceColumns } from './guards.js'

const INVITATION_TTL_MS = 72 * 60 * 60 * 1000

type SpaceFields = { name: string; slug: string; siteUrl: string }

@Injectable()
export class SpacesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(fields: SpaceFields) {
    const publicKey = `pk_${randomBytes(16).toString('base64url')}`
    const [space] = await this.uniqueSlug(() =>
      this.db
        .insert(spaces)
        .values({ ...fields, publicKey })
        .returning(spaceColumns),
    )
    return space!
  }

  async update(space: Space, fields: Partial<SpaceFields>) {
    if (!Object.keys(fields).length) return space
    const [updated] = await this.uniqueSlug(() =>
      this.db.update(spaces).set(fields).where(eq(spaces.id, space.id)).returning(spaceColumns),
    )
    return updated!
  }

  /** Génère ou régénère la clé de l'API de lecture. Elle n'est renvoyée qu'ici, une seule fois ;
   *  l'ancienne cesse aussitôt de fonctionner (document UX, « Réglages › Intégration »). */
  async regenerateApiKey(space: Space) {
    const key = generateApiKey()
    const [updated] = await this.db
      .update(spaces)
      .set({ apiKeyHash: hashToken(key), apiKeyCreatedAt: new Date() })
      .where(eq(spaces.id, space.id))
      .returning({ createdAt: spaces.apiKeyCreatedAt })
    return { key, createdAt: updated!.createdAt! }
  }

  async remove(space: Space) {
    await this.db.delete(spaces).where(eq(spaces.id, space.id))
    // Les descriptions des médias disparaissent avec l'espace ; leurs fichiers aussi.
    await removeMediaDir(space.id)
  }

  /** Membres (hors super-admins, qui voient tout sans adhésion) et invitations en attente. */
  async members(space: Space) {
    const [members, invitations] = await Promise.all([
      this.db
        .select({ id: users.id, email: users.email, joinedAt: memberships.createdAt })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.spaceId, space.id), eq(users.isSuperAdmin, false)))
        .orderBy(asc(users.email)),
      this.db
        .select({ id: tokens.id, email: tokens.email, expiresAt: tokens.expiresAt })
        .from(tokens)
        .where(this.pendingInvitations(space))
        .orderBy(asc(tokens.email)),
    ])
    return { members, invitations }
  }

  /** Ajoute directement un compte existant, sinon crée un lien d'invitation (qui remplace
   *  une éventuelle invitation en attente pour le même email). */
  async invite(space: Space, email: string) {
    const [user] = await this.db
      .select({ id: users.id, isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.email, email))
    if (user) {
      await this.db.transaction(async (tx) => {
        await tx.delete(tokens).where(and(this.pendingInvitations(space), eq(tokens.email, email)))
        // Le super-admin voit déjà tous les espaces : une adhésion serait invisible et inutile.
        if (!user.isSuperAdmin) {
          await tx
            .insert(memberships)
            .values({ userId: user.id, spaceId: space.id })
            .onConflictDoNothing()
        }
      })
      return { status: 'added' as const }
    }

    const token = newToken()
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
    await this.db.transaction(async (tx) => {
      await tx.delete(tokens).where(and(this.pendingInvitations(space), eq(tokens.email, email)))
      await tx
        .insert(tokens)
        .values({ id: hashToken(token), kind: 'invitation', email, spaceId: space.id, expiresAt })
    })
    return { status: 'invited' as const, token, expiresAt }
  }

  async cancelInvitation(space: Space, id: string) {
    const deleted = await this.db
      .delete(tokens)
      .where(and(this.pendingInvitations(space), eq(tokens.id, id)))
      .returning({ id: tokens.id })
    if (!deleted.length) throw new NotFoundException('Invitation introuvable')
  }

  async removeMember(space: Space, userId: string) {
    const deleted = await this.db
      .delete(memberships)
      .where(and(eq(memberships.spaceId, space.id), eq(memberships.userId, userId)))
      .returning({ userId: memberships.userId })
    if (!deleted.length) throw new NotFoundException('Membre introuvable')
  }

  private pendingInvitations(space: Space) {
    return and(
      eq(tokens.kind, 'invitation'),
      eq(tokens.spaceId, space.id),
      isNull(tokens.usedAt),
      gt(tokens.expiresAt, new Date()),
    )
  }

  private async uniqueSlug<T>(query: () => Promise<T>) {
    try {
      return await query()
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ce slug est déjà utilisé')
      throw err
    }
  }
}
