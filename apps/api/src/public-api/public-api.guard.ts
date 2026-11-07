import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { spaces } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'
import { hashApiKey } from './api-key.js'

export type ApiKeyRequest = Request & { space: Space }

const LIMIT = 120
const WINDOW_MS = 60_000

/** Clé API : `Authorization: Bearer dly_…`. La clé désigne l'espace ; elle est vérifiée à chaque
 *  requête, donc une clé régénérée cesse aussitôt de fonctionner. 120 requêtes par minute et
 *  par clé, compteurs en mémoire (une seule instance, comme la collecte). */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly counters = new Map<string, { count: number; resetAt: number }>()

  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<ApiKeyRequest>()
    const match = /^Bearer (dly_[A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization ?? '')
    if (!match) throw new UnauthorizedException('Clé API absente ou mal formée')
    const hash = hashApiKey(match[1]!)
    const [space] = await this.db.select().from(spaces).where(eq(spaces.apiKeyHash, hash))
    if (!space) throw new UnauthorizedException('Clé API invalide')

    const now = Date.now()
    const counter = this.counters.get(hash)
    if (!counter || counter.resetAt <= now) {
      // Les compteurs échus sont oubliés de temps en temps, pour que la table ne grossisse pas.
      if (this.counters.size > 1000) {
        for (const [key, c] of this.counters) if (c.resetAt <= now) this.counters.delete(key)
      }
      this.counters.set(hash, { count: 1, resetAt: now + WINDOW_MS })
    } else if (++counter.count > LIMIT) {
      const res = ctx.switchToHttp().getResponse<Response>()
      res.setHeader('Retry-After', String(Math.ceil((counter.resetAt - now) / 1000)))
      throw new HttpException(
        'Trop de requêtes : 120 par minute au plus',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    req.space = space
    return true
  }
}
