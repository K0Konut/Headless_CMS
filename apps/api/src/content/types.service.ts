import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  type createContentTypeSchema,
  type EntryData,
  frozenFieldChange,
  isEnComplete,
  pruneEntryData,
  type updateContentTypeSchema,
} from '@dashility/shared'
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { DB } from '../db/db.module.js'
import { isUniqueViolation } from '../db/errors.js'
import type { Db } from '../db/index.js'
import { contentTypes, entries } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'

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

  /** Types de l'espace, avec leurs compteurs pour l'écran Contenu. */
  list(space: Space) {
    const count = (filter: ReturnType<typeof sql>) =>
      sql<number>`count(${entries.id}) filter (where ${filter})::int`
    return (
      this.db
        .select({
          ...publicColumns,
          counts: {
            total: sql<number>`count(${entries.id})::int`,
            published: count(sql`${entries.published} is not null`),
            drafts: count(sql`${entries.published} is null`),
            modified: count(sql`${entries.published} is not null and ${entries.draft} is not null`),
            enIncomplete: count(sql`not ${entries.enComplete}`),
          },
        })
        .from(contentTypes)
        .leftJoin(entries, eq(entries.typeId, contentTypes.id))
        .where(eq(contentTypes.spaceId, space.id))
        .groupBy(contentTypes.id)
        // Deux créations simultanées peuvent partager une position : la date les départage.
        .orderBy(asc(contentTypes.position), asc(contentTypes.createdAt))
    )
  }

  /** Ligne complète d'un type, pour les entrées. */
  async row(space: Space, slug: string) {
    const [type] = await this.db.select().from(contentTypes).where(this.bySlug(space, slug))
    if (!type) throw new NotFoundException('Type introuvable')
    return type
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
      return await this.db.transaction(async (tx) => {
        // Le nouveau type se place en dernier.
        const [type] = await tx
          .insert(contentTypes)
          .values({
            ...body,
            spaceId: space.id,
            position: sql`coalesce((${this.db
              .select({ last: max(contentTypes.position) })
              .from(contentTypes)
              .where(eq(contentTypes.spaceId, space.id))}), -1) + 1`,
          })
          .returning({ ...publicColumns, id: contentTypes.id })
        // Une page unique a toujours son entrée : l'écran Contenu l'ouvre directement.
        if (body.kind === 'single') {
          await tx.insert(entries).values({
            typeId: type!.id,
            slug: '',
            draft: {},
            enComplete: isEnComplete(body.fields, {}),
          })
        }
        const { id, ...created } = type!
        return created
      })
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Cet identifiant est déjà utilisé')
      throw err
    }
  }

  /** Noms et champs ; l'identifiant et la nature du type, le type et le caractère traduisible
   *  des champs existants sont figés (document UX, « Structure »). */
  async update(space: Space, slug: string, body: z.infer<typeof updateContentTypeSchema>) {
    return this.db.transaction(async (tx) => {
      // Verrou : deux enregistrements simultanés du type se suivent au lieu de se croiser.
      const [current] = await tx
        .select()
        .from(contentTypes)
        .where(this.bySlug(space, slug))
        .for('update')
      if (!current) throw new NotFoundException('Type introuvable')
      if (body.kind !== current.kind) {
        throw new BadRequestException('La nature d’un type ne peut plus changer')
      }
      const frozen = frozenFieldChange(current.fields, body.fields)
      if (frozen) throw new BadRequestException(frozen)
      const [type] = await tx
        .update(contentTypes)
        .set({
          name: body.name,
          entryLabel: body.entryLabel,
          fields: body.fields,
          updatedAt: new Date(),
        })
        .where(eq(contentTypes.id, current.id))
        .returning(publicColumns)

      // Les valeurs des champs ou des choix supprimés disparaissent des entrées. Une entrée
      // modifiée change de version : un éditeur ouvert dessus devra la recharger.
      const rows = await tx.select().from(entries).where(eq(entries.typeId, current.id))
      const prune = (data: EntryData | null) => data && pruneEntryData(body.fields, data)
      for (const entry of rows) {
        const published = prune(entry.published)
        const draft = prune(entry.draft)
        const enComplete = isEnComplete(body.fields, draft ?? published ?? {})
        const changed =
          JSON.stringify([published, draft]) !== JSON.stringify([entry.published, entry.draft])
        if (!changed && enComplete === entry.enComplete) continue
        await tx
          .update(entries)
          .set({
            published,
            draft,
            enComplete,
            version: changed ? sql`${entries.version} + 1` : entry.version,
          })
          .where(eq(entries.id, entry.id))
      }
      return type!
    })
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
        .select({ slug: contentTypes.slug })
        .from(contentTypes)
        .where(eq(contentTypes.spaceId, space.id))
      const sameSet =
        slugs.length === current.length &&
        new Set(slugs).size === slugs.length &&
        current.every((t) => slugs.includes(t.slug))
      if (!sameSet) throw new ConflictException('La liste des types a changé, rechargez la page')
      // Une seule requête : la position de chaque type est son rang dans `slugs`.
      await tx
        .update(contentTypes)
        .set({
          position: sql`array_position(${sql.param(slugs)}::text[], ${contentTypes.slug}) - 1`,
        })
        // Seulement les types vérifiés : un type créé entre-temps garde sa position.
        .where(and(eq(contentTypes.spaceId, space.id), inArray(contentTypes.slug, slugs)))
    })
  }

  private bySlug(space: Space, slug: string) {
    return and(eq(contentTypes.spaceId, space.id), eq(contentTypes.slug, slug))
  }
}
