import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  type createContentTypeSchema,
  frozenFieldChange,
  type updateContentTypeSchema,
} from '@dashility/shared'
import { and, asc, eq, max, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { DB } from '../db/db.module.js'
import { isUniqueViolation } from '../db/errors.js'
import type { Db } from '../db/index.js'
import { contentTypes } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'

export type ContentType = typeof contentTypes.$inferSelect

/** Ce que l'API renvoie d'un type : sans identifiants internes. */
const publicColumns = {
  slug: contentTypes.slug,
  kind: contentTypes.kind,
  name: contentTypes.name,
  entryLabel: contentTypes.entryLabel,
  position: contentTypes.position,
  fields: contentTypes.fields,
  updatedAt: contentTypes.updatedAt,
}

@Injectable()
export class TypesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  list(space: Space) {
    return this.db
      .select(publicColumns)
      .from(contentTypes)
      .where(eq(contentTypes.spaceId, space.id))
      .orderBy(asc(contentTypes.position))
  }

  async get(space: Space, slug: string) {
    const [type] = await this.db
      .select(publicColumns)
      .from(contentTypes)
      .where(this.bySlug(space, slug))
    if (!type) throw new NotFoundException('Type introuvable')
    return type
  }

  async create(space: Space, body: z.infer<typeof createContentTypeSchema>) {
    try {
      // Le nouveau type se place en dernier.
      const [type] = await this.db
        .insert(contentTypes)
        .values({
          ...body,
          spaceId: space.id,
          position: sql`coalesce((${this.db
            .select({ last: max(contentTypes.position) })
            .from(contentTypes)
            .where(eq(contentTypes.spaceId, space.id))}), -1) + 1`,
        })
        .returning(publicColumns)
      return type!
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Cet identifiant est déjà utilisé')
      throw err
    }
  }

  /** Noms et champs ; l'identifiant et la nature du type, le type et le caractère traduisible
   *  des champs existants sont figés (document UX, « Structure »). */
  async update(space: Space, slug: string, body: z.infer<typeof updateContentTypeSchema>) {
    const [current] = await this.db.select().from(contentTypes).where(this.bySlug(space, slug))
    if (!current) throw new NotFoundException('Type introuvable')
    if ((current.kind === 'collection') !== (body.entryLabel !== null)) {
      throw new BadRequestException('Une collection a un nom d’entrée, une page unique n’en a pas')
    }
    const frozen = frozenFieldChange(current.fields, body.fields)
    if (frozen) throw new BadRequestException(frozen)
    const [type] = await this.db
      .update(contentTypes)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(contentTypes.id, current.id))
      .returning(publicColumns)
    return type!
  }

  async remove(space: Space, slug: string) {
    const deleted = await this.db
      .delete(contentTypes)
      .where(this.bySlug(space, slug))
      .returning({ id: contentTypes.id })
    if (!deleted.length) throw new NotFoundException('Type introuvable')
  }

  /** `slugs` doit contenir chaque type de l'espace une fois : un ordre partiel ou périmé
   *  (type créé ou supprimé dans un autre onglet) est refusé plutôt que deviné. */
  async reorder(space: Space, slugs: string[]) {
    await this.db.transaction(async (tx) => {
      const current = await tx
        .select({ id: contentTypes.id, slug: contentTypes.slug })
        .from(contentTypes)
        .where(eq(contentTypes.spaceId, space.id))
      const sameSet =
        slugs.length === current.length &&
        new Set(slugs).size === slugs.length &&
        current.every((t) => slugs.includes(t.slug))
      if (!sameSet) throw new ConflictException('La liste des types a changé, rechargez la page')
      for (const type of current) {
        await tx
          .update(contentTypes)
          .set({ position: slugs.indexOf(type.slug) })
          .where(eq(contentTypes.id, type.id))
      }
    })
  }

  private bySlug(space: Space, slug: string) {
    return and(eq(contentTypes.spaceId, space.id), eq(contentTypes.slug, slug))
  }
}
