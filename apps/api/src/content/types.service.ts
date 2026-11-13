import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  type createContentTypeSchema,
  type Field,
  frozenFieldChange,
  entryPruner,
  isEnComplete,
  type updateContentTypeSchema,
} from '@dashility/shared'
import { and, asc, eq, inArray, max, ne, type SQL, sql } from 'drizzle-orm'
import { isDeepStrictEqual } from 'node:util'
import type { z } from 'zod'
import { DB } from '../db/db.module.js'
import { isUniqueViolation } from '../db/errors.js'
import type { Db, Tx } from '../db/index.js'
import { alive, contentTypes, entries } from '../db/schema.js'
import { nextVersion } from './schedule.js'
import type { Space } from '../spaces/guards.js'

/** Ce que l'API renvoie d'un type : sans identifiants internes. */
const publicColumns = {
  slug: contentTypes.slug,
  kind: contentTypes.kind,
  name: contentTypes.name,
  entryLabel: contentTypes.entryLabel,
  position: contentTypes.position,
  fields: contentTypes.fields,
  featuring: contentTypes.featuring,
  updatedAt: contentTypes.updatedAt,
}

@Injectable()
export class TypesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Types de l'espace, chacun avec ses compteurs (écran Contenu, confirmation dans Structure). */
  list(space: Space) {
    return this.withCounts(eq(contentTypes.spaceId, space.id))
  }

  async get(space: Space, slug: string) {
    const [type] = await this.withCounts(this.bySlug(space, slug))
    if (!type) throw new NotFoundException('Type introuvable')
    return type
  }

  /** Ligne complète d'un type, pour les entrées. */
  async row(space: Space, slug: string) {
    const [type] = await this.db.select().from(contentTypes).where(this.bySlug(space, slug))
    if (!type) throw new NotFoundException('Type introuvable')
    return type
  }

  async create(space: Space, body: z.infer<typeof createContentTypeSchema>) {
    await this.checkTargets(this.db, space, body, body.fields)
    try {
      await this.db.transaction(async (tx) => {
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
          .returning({ id: contentTypes.id })
        // Une page unique a toujours son entrée : l'écran Contenu l'ouvre directement.
        if (body.kind === 'single') {
          await tx.insert(entries).values({
            typeId: type!.id,
            draft: {},
            enComplete: isEnComplete(body.fields, {}),
          })
        }
      })
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Cet identifiant est déjà utilisé')
      throw err
    }
    return this.get(space, body.slug)
  }

  /** Noms et champs ; l'identifiant et la nature du type, le type et le caractère traduisible
   *  des champs existants sont figés (document UX, « Structure »). */
  async update(space: Space, slug: string, body: z.infer<typeof updateContentTypeSchema>) {
    await this.db.transaction(async (tx) => {
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
      await this.checkTargets(tx, space, current, body.fields)
      await tx
        .update(contentTypes)
        .set({
          name: body.name,
          entryLabel: body.entryLabel,
          fields: body.fields,
          ...(body.featuring !== undefined && { featuring: body.featuring }),
          updatedAt: new Date(),
        })
        .where(eq(contentTypes.id, current.id))

      // Champs inchangés (renommage, ordre des types…) : les entrées ne bougent pas.
      if (isDeepStrictEqual(current.fields, body.fields)) return
      // Champs modifiés : toutes les entrées changent de version, pour qu'un éditeur ouvert sur
      // l'ancienne structure recharge au lieu d'envoyer des valeurs qu'elle ne connaît plus.
      await tx.update(entries).set(nextVersion()).where(eq(entries.typeId, current.id))
      // Les valeurs des champs ou des choix supprimés disparaissent des entrées.
      const rows = await tx.select().from(entries).where(eq(entries.typeId, current.id))
      const pruner = entryPruner(body.fields)
      for (const entry of rows) {
        const published = entry.published && pruner(entry.published)
        const draft = entry.draft && pruner(entry.draft)
        const enComplete = isEnComplete(body.fields, draft ?? published ?? {})
        // Comparaison indépendante de l'ordre des clés, que PostgreSQL ne conserve pas.
        const changed = !isDeepStrictEqual([published, draft], [entry.published, entry.draft])
        if (!changed && enComplete === entry.enComplete) continue
        await tx
          .update(entries)
          .set({ published, draft, enComplete })
          .where(eq(entries.id, entry.id))
      }
    })
    return this.get(space, slug)
  }

  /** Un type ciblé par un champ Relation d'un autre type ne se supprime pas (document UX). */
  async remove(space: Space, slug: string) {
    const others = await this.db
      .select({ name: contentTypes.name, fields: contentTypes.fields })
      .from(contentTypes)
      .where(and(eq(contentTypes.spaceId, space.id), ne(contentTypes.slug, slug)))
    for (const other of others) {
      const field = other.fields.find((f) => f.type === 'relation' && f.target === slug)
      if (field) {
        throw new ConflictException({
          code: 'type_targeted',
          message: `Ce type est utilisé par le champ « ${field.label} » de ${other.name}. Supprimez ou modifiez ce champ d’abord.`,
        })
      }
    }
    const deleted = await this.db
      .delete(contentTypes)
      .where(this.bySlug(space, slug))
      .returning({ id: contentTypes.id })
    if (!deleted.length) throw new NotFoundException('Type introuvable')
  }

  /** Chaque champ Relation cible une collection de l'espace, le type lui-même compris. */
  private async checkTargets(
    db: Db | Tx,
    space: Space,
    self: { slug: string; kind: string },
    fields: Field[],
  ) {
    const targets = [...new Set(fields.flatMap((f) => (f.type === 'relation' ? [f.target] : [])))]
    if (!targets.length) return
    const found = await db
      .select({ slug: contentTypes.slug, kind: contentTypes.kind })
      .from(contentTypes)
      .where(and(eq(contentTypes.spaceId, space.id), inArray(contentTypes.slug, targets)))
    for (const target of targets) {
      const kind = target === self.slug ? self.kind : found.find((t) => t.slug === target)?.kind
      if (kind !== 'collection') {
        throw new BadRequestException(`La cible « ${target} » n’est pas une collection de l’espace`)
      }
    }
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

  /** Types et leurs compteurs, dans l'ordre de Structure. */
  private withCounts(where: SQL | undefined) {
    return (
      this.db
        .select({
          ...publicColumns,
          counts: {
            total: sql<number>`count(${entries.id})::int`,
            published: sql<number>`count(${entries.id}) filter (where ${entries.published} is not null)::int`,
            enIncomplete: sql<number>`count(${entries.id}) filter (where not ${entries.enComplete})::int`,
            scheduled: sql<number>`count(${entries.id}) filter (where ${entries.scheduledAt} is not null)::int`,
            modified: sql<number>`count(${entries.id}) filter (where ${entries.published} is not null and ${entries.draft} is not null)::int`,
          },
          lastEntryUpdatedAt: sql`max(${entries.updatedAt})`.mapWith(entries.updatedAt),
        })
        .from(contentTypes)
        .leftJoin(entries, and(eq(entries.typeId, contentTypes.id), alive()))
        .where(where)
        .groupBy(contentTypes.id)
        // Deux créations simultanées peuvent partager une position : la date les départage.
        .orderBy(asc(contentTypes.position), asc(contentTypes.createdAt))
    )
  }

  private bySlug(space: Space, slug: string) {
    return and(eq(contentTypes.spaceId, space.id), eq(contentTypes.slug, slug))
  }
}
