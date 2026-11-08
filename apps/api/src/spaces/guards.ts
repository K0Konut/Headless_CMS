import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, eq, getTableColumns } from 'drizzle-orm'
import type { AuthedRequest } from '../auth/session.guard.js'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { memberships, spaces } from '../db/schema.js'

/** Colonnes d'un espace chargées par les gardes : sans ses secrets (empreinte de la clé API,
 *  URL et jeton de déploiement, dernier appel). Ils ne peuvent donc pas sortir par une route qui
 *  renvoie l'espace ; les services qui en ont besoin les lisent eux-mêmes. */
const { apiKeyHash, deployUrl, deployToken, deployCalledAt, deployStatus, ...spaceColumns } =
  getTableColumns(spaces)
export { spaceColumns }

export type Space = { [K in keyof typeof spaceColumns]: (typeof spaces.$inferSelect)[K] }
export type SpaceRequest = AuthedRequest & { space: Space }

/** Charge l'espace `:slug` et vérifie l'accès. Un espace inaccessible renvoie 404, jamais 403,
 *  pour ne pas révéler qu'il existe. L'appartenance est relue à chaque requête : un membre
 *  retiré perd l'accès immédiatement. */
@Injectable()
export class SpaceAccessGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<SpaceRequest>()
    const [row] = await this.db
      .select({ space: spaceColumns, memberId: memberships.userId })
      .from(spaces)
      .leftJoin(
        memberships,
        and(eq(memberships.spaceId, spaces.id), eq(memberships.userId, req.user.id)),
      )
      .where(eq(spaces.slug, String(req.params.slug)))
    if (!row || !(req.user.isSuperAdmin || row.memberId)) {
      throw new NotFoundException('Espace introuvable')
    }
    req.space = row.space
    return true
  }
}
