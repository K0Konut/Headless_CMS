import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  type EntryData,
  entryDataSchema,
  entryTitle,
  isEnComplete,
  type saveEntrySchema,
} from '@dashility/shared'
import { and, desc, eq, sql } from 'drizzle-orm'
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Statut affiché (document UX, « Statuts d'une entrée »), déduit des deux versions. */
const statusOf = (published: EntryData | null, draft: EntryData | null) =>
  !published ? 'draft' : draft ? 'modified' : 'published'

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
      status: statusOf(published, draft),
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

  async get(space: Space, typeSlug: string, id: string) {
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
    id: string,
    body: z.infer<typeof saveEntrySchema>,
    user: User,
  ) {
    const type = await this.types.row(space, typeSlug)
    const data = entryDataSchema(type.fields).parse(body.data)
    if (type.kind === 'single' && body.slug !== undefined) {
      throw new BadRequestException('Une page unique n’a pas d’identifiant d’URL')
    }
    try {
      const [entry] = await this.db
        .update(entries)
        .set({
          draft: data,
          ...(body.slug !== undefined && { slug: body.slug }),
          enComplete: isEnComplete(type.fields, data),
          version: sql`${entries.version} + 1`,
          updatedAt: new Date(),
          updatedBy: user.id,
        })
        .where(and(this.byId(type, id), eq(entries.version, body.version)))
        .returning(entryColumns)
      if (entry) return entry
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestException('Cet identifiant d’URL est déjà utilisé par une autre entrée')
      }
      throw err
    }
    await this.get(space, typeSlug, id)
    throw new ConflictException('Cette entrée a été modifiée ailleurs')
  }

  /** `single` désigne l'entrée d'une page unique ; sinon un identifiant d'entrée du type. */
  private byId(type: ContentType, id: string) {
    if (id === 'single') {
      return type.kind === 'single'
        ? and(eq(entries.typeId, type.id), eq(entries.slug, ''))
        : sql`false`
    }
    // Un identifiant mal formé désigne une entrée qui n'existe pas.
    return and(eq(entries.typeId, type.id), UUID.test(id) ? eq(entries.id, id) : sql`false`)
  }
}
