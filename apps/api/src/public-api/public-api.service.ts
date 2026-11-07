import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { type EntryData, type Field, type Locale, isEnComplete, mediaRefs } from '@dashility/shared'
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { contentTypes, entries, media } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'
import { type MediaInfo, resolveData } from './resolve.js'

type PublishedRow = { slug: string | null; published: EntryData | null; publishedAt: Date | null }

/** Lecture du contenu publié par les sites (architecture, « API publique de lecture ») : seule
 *  la version en ligne (`published`) est lue, jamais un brouillon. */
@Injectable()
export class PublicApiService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Collection : ses entrées publiées, la dernière publiée d'abord. Page unique : son entrée. */
  async content(space: Space, typeSlug: string, locale: Locale, origin: string) {
    const type = await this.type(space, typeSlug)
    const rows = await this.published(type.id)
    if (type.kind === 'single') {
      const [entry] = await this.resolve(type.fields, rows, locale, origin, space)
      if (!entry) throw new NotFoundException('Contenu introuvable')
      return entry
    }
    return this.resolve(type.fields, rows, locale, origin, space)
  }

  /** Une entrée d'une collection, par son identifiant d'URL. */
  async entry(space: Space, typeSlug: string, slug: string, locale: Locale, origin: string) {
    const type = await this.type(space, typeSlug)
    if (type.kind !== 'collection') throw new NotFoundException('Contenu introuvable')
    const rows = await this.published(type.id, slug)
    const [entry] = await this.resolve(type.fields, rows, locale, origin, space)
    if (!entry) throw new NotFoundException('Contenu introuvable')
    return entry
  }

  private async type(space: Space, slug: string) {
    const [type] = await this.db
      .select({ id: contentTypes.id, kind: contentTypes.kind, fields: contentTypes.fields })
      .from(contentTypes)
      .where(and(eq(contentTypes.spaceId, space.id), eq(contentTypes.slug, slug)))
    if (!type) throw new NotFoundException('Type introuvable')
    return type
  }

  private published(typeId: string, slug?: string): Promise<PublishedRow[]> {
    return this.db
      .select({
        slug: entries.slug,
        published: entries.published,
        publishedAt: entries.publishedAt,
      })
      .from(entries)
      .where(
        and(
          eq(entries.typeId, typeId),
          isNotNull(entries.published),
          ...(slug ? [eq(entries.slug, slug)] : []),
        ),
      )
      .orderBy(desc(entries.publishedAt))
  }

  /** En anglais, seulement les entrées dont la version publiée est complète en anglais (PRD,
   *  « Langues ») ; les médias cités sont lus en une requête. */
  private async resolve(
    fields: Field[],
    rows: PublishedRow[],
    locale: Locale,
    origin: string,
    space: Space,
  ) {
    const shown = rows.filter((r) => locale === 'fr' || isEnComplete(fields, r.published!))
    const ids = [...new Set(shown.flatMap((r) => mediaRefs(fields, r.published!).map((m) => m.id)))]
    const found = ids.length
      ? await this.db
          .select({
            id: media.id,
            kind: media.kind,
            width: media.width,
            height: media.height,
            bytes: media.bytes,
          })
          .from(media)
          .where(and(eq(media.spaceId, space.id), inArray(media.id, ids)))
      : []
    const mediaInfo = new Map<string, MediaInfo>(found.map(({ id, ...info }) => [id, info]))
    return shown.map((row) => ({
      ...(row.slug !== null && { slug: row.slug }),
      publishedAt: row.publishedAt,
      fields: resolveData(fields, row.published!, { locale, origin, media: mediaInfo }),
    }))
  }
}
