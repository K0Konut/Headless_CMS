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
  mediaRefs,
  publicationIssues,
  publicationMessage,
  type saveEntrySchema,
} from '@dashility/shared'
import { and, desc, eq, ne, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { DB } from '../db/db.module.js'
import { isUniqueViolation } from '../db/errors.js'
import type { Db, User } from '../db/index.js'
import { contentTypes, entries } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'
import { DeployService } from '../deploy/deploy.service.js'
import { MediaService } from '../media/media.service.js'
import { TypesService } from './types.service.js'

type ContentType = typeof contentTypes.$inferSelect

/** Ce que l'API renvoie d'une entrée. */
const entryColumns = {
  id: entries.id,
  slug: entries.slug,
  draftSlug: entries.draftSlug,
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
    private readonly media: MediaService,
    private readonly deploy: DeployService,
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
    // Une image ou un PDF cité doit avoir été envoyé dans cet espace.
    await this.media.checkRefs(space, mediaRefs(type.fields, data))
    if (type.kind === 'single' && body.slug !== undefined) {
      throw new BadRequestException('Une page unique n’a pas d’identifiant d’URL')
    }
    const [current] = await this.db
      .select({ id: entries.id, slug: entries.slug, published: entries.published })
      .from(entries)
      .where(this.byId(type, id))
    if (!current) throw new NotFoundException('Entrée introuvable')

    // Sur une entrée publiée, l'identifiant d'URL attend « Publier », comme le contenu : il va
    // dans `draftSlug` (null : rien en attente, l'entrée garde son adresse).
    const live = !!current.published
    let slug = body.slug
    if (live && slug === null) slug = current.slug
    // Un identifiant déjà pris (en ligne ou en attente) n'empêche pas d'enregistrer le contenu :
    // il n'est pas changé, et la réponse le signale.
    let slugError: string | undefined
    if (slug && slug !== current.slug) {
      const [taken] = await this.db
        .select({ id: entries.id })
        .from(entries)
        .where(
          and(
            eq(entries.typeId, type.id),
            ne(entries.id, current.id),
            or(eq(entries.slug, slug), eq(entries.draftSlug, slug)),
          ),
        )
      if (taken) {
        slug = undefined
        slugError = 'Cet identifiant d’URL est déjà utilisé par une autre entrée'
      }
    }
    const slugChange =
      slug === undefined ? {} : live ? { draftSlug: slug === current.slug ? null : slug } : { slug }
    try {
      const [entry] = await this.db
        .update(entries)
        .set({
          draft: data,
          ...slugChange,
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

  /** « Publier » : la version en cours d'édition (`draft`) devient la version en ligne, après les
   *  contrôles de publication (document UX, « Publier »). */
  async publish(space: Space, typeSlug: string, id: EntryRef, version: number, user: User) {
    const type = await this.types.row(space, typeSlug)
    const current = await this.current(type, id, version)
    if (!current.draft)
      throw new BadRequestException('Rien à publier : aucune modification en attente')
    const slug = current.draftSlug ?? current.slug
    const issues = publicationIssues(type, current.draft, slug)
    if (issues.length) {
      throw new BadRequestException({
        code: 'publication_invalid',
        message: publicationMessage(issues),
        issues,
      })
    }
    let entry
    try {
      entry = await this.write(current.id, version, user, {
        published: current.draft,
        draft: null,
        slug,
        draftSlug: null,
        enComplete: isEnComplete(type.fields, current.draft),
        publishedAt: new Date(),
      })
    } catch (err) {
      // Identifiant pris en ligne entre-temps par une autre entrée.
      if (isUniqueViolation(err)) {
        throw new BadRequestException('Cet identifiant d’URL est déjà utilisé par une autre entrée')
      }
      throw err
    }
    // Ce que le site affiche a changé : un déploiement est demandé (regroupé sur 10 s).
    this.deploy.schedule(space.id)
    return entry
  }

  /** « Annuler les modifications » : on revient à la version en ligne. */
  async discard(space: Space, typeSlug: string, id: EntryRef, version: number, user: User) {
    const type = await this.types.row(space, typeSlug)
    const current = await this.current(type, id, version)
    if (!current.published || !current.draft) {
      throw new BadRequestException('Aucune modification en attente à annuler')
    }
    return this.write(current.id, version, user, {
      draft: null,
      draftSlug: null,
      enComplete: isEnComplete(type.fields, current.published),
    })
  }

  /** « Dépublier » : l'entrée redevient un brouillon, avec ses modifications en attente s'il y en
   *  a, et disparaît du site au prochain déploiement. */
  async unpublish(space: Space, typeSlug: string, id: EntryRef, version: number, user: User) {
    const type = await this.types.row(space, typeSlug)
    const current = await this.current(type, id, version)
    if (!current.published) throw new BadRequestException('Cette entrée n’est pas publiée')
    const entry = await this.write(current.id, version, user, {
      published: null,
      draft: current.draft ?? current.published,
      // Hors ligne, l'identifiant en attente redevient l'identifiant tout court.
      slug: current.draftSlug ?? current.slug,
      draftSlug: null,
    })
    this.deploy.schedule(space.id)
    return entry
  }

  /** Suppression définitive (pas d'historique, PRD). Une page unique ne se supprime pas : elle
   *  disparaît avec son type. */
  async remove(space: Space, typeSlug: string, id: EntryRef) {
    const type = await this.types.row(space, typeSlug)
    if (type.kind === 'single') throw new BadRequestException('Une page unique ne se supprime pas')
    const deleted = await this.db
      .delete(entries)
      .where(this.byId(type, id))
      .returning({ id: entries.id, published: entries.published })
    if (!deleted.length) throw new NotFoundException('Entrée introuvable')
    // Un brouillon n'était pas sur le site : rien à redéployer.
    if (deleted[0]!.published) this.deploy.schedule(space.id)
  }

  /** L'entrée, à condition que la version lue soit toujours la sienne. */
  private async current(type: ContentType, id: EntryRef, version: number) {
    const [entry] = await this.db.select().from(entries).where(this.byId(type, id))
    if (!entry) throw new NotFoundException('Entrée introuvable')
    if (entry.version !== version)
      throw new ConflictException('Cette entrée a été modifiée ailleurs')
    return entry
  }

  /** Écrit un changement de statut, seulement si personne n'a modifié l'entrée entre-temps. */
  private async write(
    id: string,
    version: number,
    user: User,
    change: Pick<
      Partial<typeof entries.$inferInsert>,
      'published' | 'draft' | 'slug' | 'draftSlug' | 'enComplete' | 'publishedAt'
    >,
  ) {
    const [entry] = await this.db
      .update(entries)
      .set({
        ...change,
        version: sql`${entries.version} + 1`,
        updatedAt: new Date(),
        updatedBy: user.id,
      })
      .where(and(eq(entries.id, id), eq(entries.version, version)))
      .returning(entryColumns)
    if (!entry) throw new ConflictException('Cette entrée a été modifiée ailleurs')
    return entry
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
