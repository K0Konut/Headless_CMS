import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  entryDataSchema,
  entryStatus,
  entryTitle,
  isEnComplete,
  type saveEntrySchema,
} from '@dashility/shared'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { DB } from '../db/db.module.js'
import { isUniqueViolation } from '../db/errors.js'
import type { Db, User } from '../db/index.js'
import { contentTypes, entries } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'
import { TypesService } from './types.service.js'

type ContentType = typeof contentTypes.$inferSelect

/** Ce que l'API renvoie d'une entrée. */
const entryColumns = {
  id: entries.id,
  slug: entries.slug,
  published: entries.published,
  draft: entries.draft,
  enComplete: entries.enComplete,
  version: entries.version,
  publishedAt: entries.publishedAt,
  updatedAt: entries.updatedAt,
}

/** Une entrée d'une collection (identifiant validé par la route), ou celle d'une page unique. */
export type EntryRef = string | 'single'

@Injectable()
export class EntriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly types: TypesService,
  ) {}

  /** Entrées d'une collection, la dernière modifiée d'abord. */
  async list(space: Space, typeSlug: string) {
    const type = await this.types.row(space, typeSlug)
    const rows = await this.db
      .select(entryColumns)
      .from(entries)
      .where(eq(entries.typeId, type.id))
      .orderBy(desc(entries.updatedAt))
    return rows.map(({ id, slug, published, draft, enComplete, updatedAt }) => ({
      id,
      slug,
      title: entryTitle(type.fields, draft ?? published ?? {}),
      status: entryStatus({ published, draft }),
      enComplete,
      updatedAt,
    }))
  }

  /** Nouvelle entrée d'une collection, en brouillon vide. */
  async create(space: Space, typeSlug: string, user: User) {
    const type = await this.types.row(space, typeSlug)
    if (type.kind !== 'collection') {
      throw new BadRequestException('Une page unique a déjà son entrée')
    }
    const [entry] = await this.db
      .insert(entries)
      .values({
        typeId: type.id,
        draft: {},
        enComplete: isEnComplete(type.fields, {}),
        updatedBy: user.id,
      })
      .returning(entryColumns)
    return entry!
  }

  async get(space: Space, typeSlug: string, id: EntryRef) {
    const type = await this.types.row(space, typeSlug)
    const [entry] = await this.db.select(entryColumns).from(entries).where(this.byId(type, id))
    if (!entry) throw new NotFoundException('Entrée introuvable')
    return entry
  }

  /** Sauvegarde automatique : les valeurs vont toujours dans `draft`. La version envoyée doit
   *  être la version actuelle, sinon l'entrée a été modifiée ailleurs entre-temps. */
  async save(
    space: Space,
    typeSlug: string,
    id: EntryRef,
    body: z.infer<typeof saveEntrySchema>,
    user: User,
  ) {
    const type = await this.types.row(space, typeSlug)
    const data = entryDataSchema(type.fields).parse(body.data)
    if (type.kind === 'single' && body.slug !== undefined) {
      throw new BadRequestException('Une page unique n’a pas d’identifiant d’URL')
    }
    const [current] = await this.db
      .select({ id: entries.id, slug: entries.slug })
      .from(entries)
      .where(this.byId(type, id))
    if (!current) throw new NotFoundException('Entrée introuvable')

    // Un identifiant d'URL déjà pris n'empêche pas d'enregistrer le contenu : l'entrée garde son
    // identifiant actuel et la réponse le signale.
    let slug = body.slug
    let slugError: string | undefined
    if (slug && slug !== current.slug) {
      const [taken] = await this.db
        .select({ id: entries.id })
        .from(entries)
        .where(and(eq(entries.typeId, type.id), eq(entries.slug, slug), ne(entries.id, current.id)))
      if (taken) {
        slug = undefined
        slugError = 'Cet identifiant d’URL est déjà utilisé par une autre entrée'
      }
    }
    try {
      const [entry] = await this.db
        .update(entries)
        .set({
          draft: data,
          ...(slug !== undefined && { slug }),
          enComplete: isEnComplete(type.fields, data),
          version: sql`${entries.version} + 1`,
          updatedAt: new Date(),
          updatedBy: user.id,
        })
        .where(and(eq(entries.id, current.id), eq(entries.version, body.version)))
        .returning(entryColumns)
      if (!entry) throw new ConflictException('Cette entrée a été modifiée ailleurs')
      return slugError ? { ...entry, slugError } : entry
    } catch (err) {
      // Pris entre la vérification et l'écriture : cas rare, signalé sans perdre la suite.
      if (isUniqueViolation(err)) {
        throw new BadRequestException('Cet identifiant d’URL est déjà utilisé par une autre entrée')
      }
      throw err
    }
  }

  /** `single` désigne l'entrée d'une page unique, la seule de son type. */
  private byId(type: ContentType, id: EntryRef) {
    if ((id === 'single') !== (type.kind === 'single')) {
      throw new NotFoundException('Entrée introuvable')
    }
    return id === 'single'
      ? eq(entries.typeId, type.id)
      : and(eq(entries.typeId, type.id), eq(entries.id, id))
  }
}
