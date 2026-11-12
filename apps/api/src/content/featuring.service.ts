import { Inject, Injectable } from '@nestjs/common'
import {
  type EntryData,
  type FeaturedSummary,
  FEATURED_PLACES,
  type Featuring,
  type Field,
  entryTitle,
  featuredOrder,
} from '@dashility/shared'
import { and, asc, count, eq, inArray, isNotNull } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { contentTypes, entries, events } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'

/** Ce que le classement lit d'un type. */
export type FeaturedType = { id: string; fields: Field[]; featuring: Featuring }

/** Date du jour à Paris (`2026-11-12`) : le tirage change chaque jour, pas à chaque appel. */
const parisDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format()

/** Mise en avant (architecture, « V3 : mise en avant ») : relie les pages vues aux entrées
 *  publiées d'un type, puis les ordonne avec `featuredOrder`. Calculé à chaque demande. */
@Injectable()
export class FeaturingService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Toutes les entrées publiées du type, dans l'ordre de mise en avant. `draw` : ordonner les
   *  non classées par le tirage du jour (lecture du site) ; sinon leur ordre est sans objet. */
  async order(space: Space, type: FeaturedType, draw: boolean) {
    const rows = await this.db
      .select({
        id: entries.id,
        slug: entries.slug,
        published: entries.published,
        publishedAt: entries.publishedAt,
      })
      .from(entries)
      .where(
        and(eq(entries.typeId, type.id), isNotNull(entries.published), isNotNull(entries.slug)),
      )

    // Chemin de page → entrée, pour chaque langue réglée.
    const templates = [type.featuring.paths.fr, type.featuring.paths.en].filter(
      (t): t is string => !!t,
    )
    const entryOf = new Map<string, string>()
    for (const row of rows) {
      for (const t of templates) entryOf.set(t.replace('{slug}', row.slug!), row.id)
    }
    // La rétention ne garde que 6 mois d'événements : c'est la période du score.
    const counts = entryOf.size
      ? await this.db
          .select({ path: events.path, kind: events.kind, n: count() })
          .from(events)
          .where(and(eq(events.spaceId, space.id), inArray(events.path, [...entryOf.keys()])))
          .groupBy(events.path, events.kind)
      : []
    const stats = new Map(rows.map((r) => [r.id, { views: 0, cv: 0 }]))
    for (const { path, kind, n } of counts) {
      const s = stats.get(entryOf.get(path)!)!
      if (kind === 'view') s.views += n
      else s.cv += n
    }

    const force = type.fields.find((f) => f.key === type.featuring.forceField)
    const day = parisDay()
    return featuredOrder(
      rows.map((row) => {
        const value = force && (row.published as EntryData)[force.key]
        // Jamais touché : la valeur par défaut, comme l'API publique la renvoie.
        const forced =
          force?.type === 'boolean' && (typeof value === 'boolean' ? value : force.defaultValue)
        return { ...row, ...stats.get(row.id)!, forced: !!forced }
      }),
      draw
        ? (row) => createHash('sha256').update(`${day}:${type.id}:${row.id}`).digest('hex')
        : undefined,
    )
  }

  /** Classement de chaque type mis en avant, pour l'onglet Analytics. Les entrées non classées
   *  sont triées par vues ; le tirage, qui change chaque jour, n'est pas montré. */
  async summary(space: Space): Promise<FeaturedSummary[]> {
    const types = await this.db
      .select({
        id: contentTypes.id,
        slug: contentTypes.slug,
        name: contentTypes.name,
        fields: contentTypes.fields,
        featuring: contentTypes.featuring,
      })
      .from(contentTypes)
      .where(and(eq(contentTypes.spaceId, space.id), isNotNull(contentTypes.featuring)))
      .orderBy(asc(contentTypes.position))
    return Promise.all(
      types.map(async (type) => {
        const order = await this.order(space, { ...type, featuring: type.featuring! }, false)
        const places = order.slice(0, FEATURED_PLACES)
        const rows = order.map((row, i) => ({
          id: row.id,
          title: entryTitle(type.fields, row.published as EntryData),
          views: row.views,
          cv: row.cv,
          score: row.score,
          forced: row.forced,
          rank: row.rank,
          featured: i < FEATURED_PLACES && row.reason !== 'drawn',
        }))
        const unranked = rows.filter((r) => r.score === null && !r.forced)
        unranked.sort((a, b) => b.views - a.views)
        return {
          type: { slug: type.slug, name: type.name },
          rows: [...rows.filter((r) => r.score !== null || r.forced), ...unranked],
          drawnPlaces: places.filter((r) => r.reason === 'drawn').length,
        }
      }),
    )
  }
}
