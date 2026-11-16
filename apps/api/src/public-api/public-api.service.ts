import { GoneException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { FEATURED_PLACES } from '@dashility/shared'
import {
  type EntryData,
  type Field,
  type Locale,
  entryStatus,
  entryTitle,
  isEnComplete,
  mediaRefs,
  relationRefs,
} from '@dashility/shared'
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { hashToken } from '../auth/tokens.js'
import { alive, contentTypes, entries, media, previewLinks } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'
import { FeaturingService } from '../content/featuring.service.js'
import { type MediaInfo, resolveData } from './resolve.js'

/** Entrée en ligne pour les sites : publiée, hors corbeille. En anglais, il faut aussi que sa
 *  version publiée soit complète en anglais (`shownIn`). */
const online = () => and(isNotNull(entries.published), alive())
const shownIn = (locale: Locale, fields: Field[], data: EntryData) =>
  locale === 'fr' || isEnComplete(fields, data)

/** Une entrée à résoudre : sa version en ligne pour l'API publique, sa version en cours pour un
 *  aperçu. */
type Row = { slug: string | null; data: EntryData; publishedAt: Date | null }

/** Lecture du contenu publié par les sites (architecture, « API publique de lecture ») : seule
 *  la version en ligne (`published`) est lue, jamais un brouillon. Seule exception, l'aperçu
 *  (V3), qui lit la version en cours d'une entrée avec un jeton. */
@Injectable()
export class PublicApiService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly featuring: FeaturingService,
  ) {}

  /** Collection : ses entrées publiées, la dernière publiée d'abord. Page unique : son entrée. */
  async content(space: Space, typeSlug: string, locale: Locale, origin: string) {
    const type = await this.type(space, typeSlug)
    const rows = await this.published(type.fields, type.id, locale)
    if (type.kind === 'single') {
      const [entry] = await this.resolve(type.fields, rows, locale, origin, space.id)
      if (!entry) throw new NotFoundException('Contenu introuvable')
      return entry
    }
    return this.resolve(type.fields, rows, locale, origin, space.id)
  }

  /** Une entrée d'une collection, par son identifiant d'URL. */
  async entry(space: Space, typeSlug: string, slug: string, locale: Locale, origin: string) {
    const type = await this.type(space, typeSlug)
    if (type.kind !== 'collection') throw new NotFoundException('Contenu introuvable')
    const rows = await this.published(type.fields, type.id, locale, slug)
    const [entry] = await this.resolve(type.fields, rows, locale, origin, space.id)
    if (!entry) throw new NotFoundException('Contenu introuvable')
    return entry
  }

  /** Entrées mises en avant d'un type (V3), dans l'ordre : forcées, classées, tirées. En
   *  anglais, une entrée incomplète est sautée et la suivante prend sa place. */
  async featured(space: Space, typeSlug: string, locale: Locale, origin: string) {
    const type = await this.type(space, typeSlug)
    if (!type.featuring) {
      throw new NotFoundException({
        code: 'type_not_featured',
        message: 'Ce type n’a pas de mise en avant',
      })
    }
    const order = await this.featuring.order(space, { ...type, featuring: type.featuring }, true)
    const shown = order
      .filter((row) => locale === 'fr' || isEnComplete(type.fields, row.published!))
      .slice(0, FEATURED_PLACES)
    const rows = shown.map((r) => ({
      slug: r.slug,
      data: r.published!,
      publishedAt: r.publishedAt,
    }))
    const resolved = await this.resolve(type.fields, rows, locale, origin, space.id)
    return resolved.map((entry, i) => ({ ...entry, featured: shown[i]!.reason }))
  }

  private async type(space: Space, slug: string) {
    const [type] = await this.db
      .select({
        id: contentTypes.id,
        kind: contentTypes.kind,
        fields: contentTypes.fields,
        featuring: contentTypes.featuring,
      })
      .from(contentTypes)
      .where(and(eq(contentTypes.spaceId, space.id), eq(contentTypes.slug, slug)))
    if (!type) throw new NotFoundException('Type introuvable')
    return type
  }

  /** Aperçu (V3) : la version en cours de l'entrée du jeton (`draft ?? published`), comme
   *  l'éditeur la montre. En anglais, elle est renvoyée même incomplète : l'aperçu montre ce
   *  qui manque. */
  async preview(token: string, locale: Locale, origin: string) {
    const [link] = await this.db
      .select({
        expiresAt: previewLinks.expiresAt,
        entry: {
          slug: entries.slug,
          draftSlug: entries.draftSlug,
          published: entries.published,
          draft: entries.draft,
          publishedAt: entries.publishedAt,
        },
        type: { slug: contentTypes.slug, kind: contentTypes.kind, fields: contentTypes.fields },
        spaceId: contentTypes.spaceId,
      })
      .from(previewLinks)
      // Une entrée de la corbeille n'a plus d'aperçu : « Cette entrée n'existe plus ».
      .leftJoin(entries, and(eq(entries.id, previewLinks.entryId), alive()))
      .leftJoin(contentTypes, eq(contentTypes.id, entries.typeId))
      .where(eq(previewLinks.id, hashToken(token)))
    if (!link) {
      throw new NotFoundException({ code: 'preview_not_found', message: 'Lien d’aperçu invalide' })
    }
    if (link.expiresAt <= new Date()) {
      throw new GoneException({ code: 'preview_expired', message: 'Ce lien d’aperçu a expiré' })
    }
    const { entry, type, spaceId } = link
    if (!entry || !type || !spaceId) {
      throw new NotFoundException({
        code: 'preview_entry_deleted',
        message: 'Cette entrée n’existe plus',
      })
    }
    const data = entry.draft ?? entry.published!
    const row = { slug: entry.draftSlug ?? entry.slug, data, publishedAt: entry.publishedAt }
    const [resolved] = await this.resolve(type.fields, [row], locale, origin, spaceId)
    return {
      type: type.slug,
      kind: type.kind,
      ...resolved!,
      status: entryStatus(entry),
      enComplete: isEnComplete(type.fields, data),
      expiresAt: link.expiresAt,
    }
  }

  /** Entrées publiées d'un type ; en anglais, seulement celles dont la version publiée est
   *  complète en anglais (PRD, « Langues »). */
  private async published(fields: Field[], typeId: string, locale: Locale, slug?: string) {
    const rows = await this.db
      .select({
        slug: entries.slug,
        published: entries.published,
        publishedAt: entries.publishedAt,
      })
      .from(entries)
      .where(and(eq(entries.typeId, typeId), online(), ...(slug ? [eq(entries.slug, slug)] : [])))
      .orderBy(desc(entries.publishedAt))
    return rows
      .map((r): Row => ({ slug: r.slug, data: r.published!, publishedAt: r.publishedAt }))
      .filter((r) => shownIn(locale, fields, r.data))
  }

  /** Valeurs résolues pour la langue ; les médias cités sont lus en une requête, les entrées
   *  liées par les champs Relation en une autre. */
  private async resolve(
    fields: Field[],
    rows: Row[],
    locale: Locale,
    origin: string,
    spaceId: string,
  ) {
    const ids = [...new Set(rows.flatMap((r) => mediaRefs(fields, r.data).map((m) => m.id)))]
    const refs = rows.flatMap((r) => relationRefs(fields, r.data))
    // Médias et entrées liées : deux lectures indépendantes, en parallèle.
    const [found, relations] = await Promise.all([
      ids.length
        ? this.db
            .select({
              id: media.id,
              kind: media.kind,
              width: media.width,
              height: media.height,
              bytes: media.bytes,
            })
            .from(media)
            .where(and(eq(media.spaceId, spaceId), inArray(media.id, ids)))
        : [],
      this.relations(refs, locale, spaceId),
    ])
    const mediaInfo = new Map<string, MediaInfo>(found.map(({ id, ...info }) => [id, info]))
    return rows.map((row) => ({
      ...(row.slug !== null && { slug: row.slug }),
      publishedAt: row.publishedAt,
      fields: resolveData(fields, row.data, { locale, origin, media: mediaInfo, relations }),
    }))
  }

  /** Entrées liées en ligne (V4) : publiées, hors corbeille, de cet espace, et complètes en
   *  anglais si la langue est l'anglais (même règle que `/content`). Identifiant et titre. */
  private async relations(ids: string[], locale: Locale, spaceId: string) {
    const unique = [...new Set(ids)]
    const found = unique.length
      ? await this.db
          .select({
            id: entries.id,
            slug: entries.slug,
            published: entries.published,
            fields: contentTypes.fields,
          })
          .from(entries)
          .innerJoin(contentTypes, eq(contentTypes.id, entries.typeId))
          .where(and(inArray(entries.id, unique), eq(contentTypes.spaceId, spaceId), online()))
      : []
    return new Map(
      found
        .filter((e) => shownIn(locale, e.fields, e.published!))
        .map((e) => [
          e.id,
          // Un titre anglais facultatif et vide : le titre français plutôt qu'une étiquette vide.
          {
            slug: e.slug,
            title: entryTitle(e.fields, e.published!, locale) || entryTitle(e.fields, e.published!),
          },
        ]),
    )
  }
}
