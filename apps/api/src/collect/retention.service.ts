import { Inject, Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { lt, sql } from 'drizzle-orm'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { events } from '../db/schema.js'

/** Les événements sont gardés 6 mois. */
@Injectable()
export class RetentionService {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Cron('0 3 * * *', { timeZone: 'Europe/Paris' })
  purge() {
    return this.db.delete(events).where(lt(events.createdAt, sql`now() - interval '6 months'`))
  }
}
