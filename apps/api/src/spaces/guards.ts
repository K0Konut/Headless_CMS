import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { AuthedRequest } from '../auth/session.guard.js'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { memberships, spaces } from '../db/schema.js'

export type Space = typeof spaces.$inferSelect
export type SpaceRequest = AuthedRequest & { space: Space }

/** Charge l'espace `:slug` et vérifie l'accès. Un espace inaccessible renvoie 404, jamais 403,
 *  pour ne pas révéler qu'il existe. L'appartenance est relue à chaque requête : un membre
 *  retiré perd l'accès immédiatement. */
@Injectable()
export class SpaceAccessGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<SpaceRequest>()
    const [space] = await this.db
      .select()
      .from(spaces)
      .where(eq(spaces.slug, String(req.params.slug)))
    const isMember =
      space &&
      (req.user.isSuperAdmin ||
        (
          await this.db
            .select({ userId: memberships.userId })
            .from(memberships)
            .where(and(eq(memberships.spaceId, space.id), eq(memberships.userId, req.user.id)))
        ).length > 0)
    if (!isMember) throw new NotFoundException('Espace introuvable')
    req.space = space
    return true
  }
}

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    if (!ctx.switchToHttp().getRequest<AuthedRequest>().user.isSuperAdmin) {
      throw new ForbiddenException('Réservé au super-admin')
    }
    return true
  }
}

/** Pipe pour les identifiants : un identifiant mal formé désigne une ressource qui n'existe pas. */
export const uuidOr404 = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException() })
