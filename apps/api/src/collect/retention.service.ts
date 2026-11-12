import { RETENTION_MONTHS } from '@dashility/shared'
import { Inject, Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { lt, sql } from 'drizzle-orm'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { events, previewLinks } from '../db/schema.js'

/** Les événements sont gardés 6 mois. Les liens d'aperçu, 7 jours après leur expiration : entre-
 *  temps, ils répondent « expiré » plutôt que « invalide ». */
@Injectable()
export class RetentionService {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Cron('0 3 * * *', { timeZone: 'Europe/Paris' })
  async purge() {
    // Indépendantes : l'échec de l'une ne doit pas empêcher l'autre.
    const results = await Promise.allSettled([
      this.db
        .delete(events)
        .where(lt(events.createdAt, sql.raw(`now() - interval '${RETENTION_MONTHS} months'`))),
      this.db
        .delete(previewLinks)
        .where(lt(previewLinks.expiresAt, sql`now() - interval '7 days'`)),
    ])
    for (const result of results) if (result.status === 'rejected') throw result.reason
  }
}
