import { addDays, oldestDate } from '@dashility/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { events } from '../db/schema.js'
import type { LiveEvent } from './live.service.js'

const views = sql<number>`count(*) filter (where ${events.kind} = 'view')::int`
const cvs = sql<number>`count(*) filter (where ${events.kind} = 'cv')::int`

/** Provenance regroupée à la lecture : le domaine brut reste en base. */
const source = sql<string>`case
  when ${events.referrer} = '' then 'Accès direct'
  when ${events.referrer} in ('linkedin.com', 'lnkd.in') or ${events.referrer} like '%.linkedin.com' then 'LinkedIn'
  when ${events.referrer} = 'github.com' or ${events.referrer} like '%.github.com' then 'GitHub'
  when ${events.referrer} ~ '(^|\\.)google\\.[a-z.]+$' then 'Google'
  else regexp_replace(${events.referrer}, '^www\\.', '')
end`

/** Événements d'un espace entre deux dates locales (Europe/Paris), bornes incluses. */
function inPeriod(spaceId: string, from: string, to: string) {
  return and(
    eq(events.spaceId, spaceId),
    sql`${events.createdAt} >= (${from}::date::timestamp at time zone 'Europe/Paris')`,
    sql`${events.createdAt} < ((${to}::date + 1)::timestamp at time zone 'Europe/Paris')`,
  )
}

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async summary(spaceId: string, from: string, to: string) {
    const where = inPeriod(spaceId, from, to)
    const day = sql<string>`to_char(${events.createdAt} at time zone 'Europe/Paris', 'YYYY-MM-DD')`

    // Période précédente, de même durée, juste avant `from`.
    const length = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1
    const prevTo = addDays(from, -1)
    const prevFrom = addDays(from, -length)

    const [perDay, pages, referrers, [any], prev] = await Promise.all([
      this.db.select({ date: day, views, cvs }).from(events).where(where).groupBy(day),
      this.db
        .select({ path: events.path, views, cvs })
        .from(events)
        .where(where)
        .groupBy(events.path)
        .orderBy(desc(views), events.path)
        .limit(100),
      this.db
        .select({ source, views: sql<number>`count(*)::int` })
        .from(events)
        .where(and(where, eq(events.kind, 'view')))
        .groupBy(source)
        .orderBy(desc(sql`count(*)`)),
      this.db.select({ id: events.id }).from(events).where(eq(events.spaceId, spaceId)).limit(1),
      // Seulement si elle est encore entièrement conservée : sinon l'écart serait faux.
      prevFrom >= oldestDate()
        ? this.db
            .select({ views, cvs })
            .from(events)
            .where(inPeriod(spaceId, prevFrom, prevTo))
            .then(([counts]) => counts!)
        : null,
    ])

    // Tous les jours de la période, à 0 quand il ne s'est rien passé.
    const byDate = new Map(perDay.map((d) => [d.date, d]))
    const daily = []
    for (let date = from; date <= to; date = addDays(date, 1)) {
      daily.push(byDate.get(date) ?? { date, views: 0, cvs: 0 })
    }
    const totals = { views: 0, cvs: 0 }
    for (const d of perDay) {
      totals.views += d.views
      totals.cvs += d.cvs
    }

    const previous = prev && { from: prevFrom, to: prevTo, ...prev }
    return { totals, previous, daily, pages, referrers, hasEvents: !!any }
  }

  /** Événements bruts de la période, du plus ancien au plus récent. */
  export(spaceId: string, from: string, to: string) {
    return this.db
      .select({
        createdAt: events.createdAt,
        kind: events.kind,
        path: events.path,
        referrer: events.referrer,
      })
      .from(events)
      .where(inPeriod(spaceId, from, to))
      .orderBy(events.createdAt)
  }

  /** État initial de l'encart temps réel : horodatages des vues des 30 dernières minutes (le
   *  client fait glisser la fenêtre lui-même) et 20 derniers événements. */
  async liveSnapshot(spaceId: string) {
    const since = new Date(Date.now() - 30 * 60_000)
    const [viewTimes, recent] = await Promise.all([
      this.db
        .select({ at: events.createdAt })
        .from(events)
        .where(
          and(eq(events.spaceId, spaceId), eq(events.kind, 'view'), gte(events.createdAt, since)),
        ),
      this.db
        .select({ at: events.createdAt, kind: events.kind, path: events.path })
        .from(events)
        .where(eq(events.spaceId, spaceId))
        .orderBy(desc(events.createdAt))
        .limit(20),
    ])
    return {
      viewTimes: viewTimes.map((r) => r.at.toISOString()),
      recent: recent.map((e): LiveEvent => ({ ...e, at: e.at.toISOString() })),
    }
  }
}
