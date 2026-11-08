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
  type scheduleEntrySchema,
  type EntryData,
} from '@dashility/shared'
import { and, desc, eq, lte, ne, or, sql } from 'drizzle-orm'
import { Cron } from '@nestjs/schedule'
import type { z } from 'zod'
import { DB } from '../db/db.module.js'
import { isUniqueViolation } from '../db/errors.js'
import type { Db, User } from '../db/index.js'
import { contentTypes, entries } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'
import { DeployService } from '../deploy/deploy.service.js'
import { MediaService } from '../media/media.service.js'
import { clearSchedule } from './schedule.js'
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
  scheduledAt: entries.scheduledAt,
  lastSchedule: entries.lastSchedule,
}

const MINUTE = 60_000
const YEAR = 366 * 24 * 60 * MINUTE

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
    return rows.map(({ id, slug, published, draft, enComplete, updatedAt, scheduledAt }) => ({
      id,
      slug,
      title: entryTitle(type.fields, draft ?? published ?? {}),
      status: entryStatus({ published, draft }),
      enComplete,
      updatedAt,
      scheduledAt,
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
      .select({
        id: entries.id,
        slug: entries.slug,
        published: entries.published,
        scheduledAt: entries.scheduledAt,
      })
      .from(entries)
      .where(this.byId(type, id))
    if (!current) throw new NotFoundException('Entrée introuvable')
    // La version programmée est figée : on annule d'abord la programmation (« Modifier l'entrée »).
    if (current.scheduledAt) {
      throw new ConflictException({
        code: 'entry_scheduled',
        message: 'Cette entrée est programmée : annulez la programmation pour la modifier',
      })
    }

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
          // Programmée entre la lecture et l'écriture : la modification l'annule.
          ...clearSchedule(true),
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
    const slug = this.checkPublication(type, current)
    // Publier tout de suite retire la programmation, sans message : c'est la publication voulue.
    const entry = await this.write(
      current.id,
      version,
      user,
      {
        published: current.draft,
        draft: null,
        slug,
        draftSlug: null,
        enComplete: isEnComplete(type.fields, current.draft),
        publishedAt: new Date(),
      },
      false,
    )
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

  /** « Programmer… » : la version actuelle sera publiée à l'heure dite, après les contrôles de
   *  « Publier » faits dès maintenant. La version ne change pas : rien n'est réécrit. */
  async schedule(
    space: Space,
    typeSlug: string,
    id: EntryRef,
    body: z.infer<typeof scheduleEntrySchema>,
  ) {
    const type = await this.types.row(space, typeSlug)
    const current = await this.current(type, id, body.version)
    if (!current.draft)
      throw new BadRequestException('Rien à publier : aucune modification en attente')
    const at = new Date(body.at)
    const now = Date.now()
    if (at.getTime() < now + MINUTE) {
      throw new BadRequestException('Choisissez une date à venir (au moins dans une minute)')
    }
    if (at.getTime() > now + YEAR) {
      throw new BadRequestException('Choisissez une date dans l’année qui vient')
    }
    this.checkPublication(type, current)
    const [entry] = await this.db
      .update(entries)
      .set({ scheduledAt: at, scheduledVersion: body.version, lastSchedule: null })
      .where(and(eq(entries.id, current.id), eq(entries.version, body.version)))
      .returning(entryColumns)
    if (!entry) throw new ConflictException('Cette entrée a été modifiée ailleurs')
    return entry
  }

  /** « Annuler la programmation » : l'entrée reste dans son état, sans message (c'est un choix). */
  async unschedule(space: Space, typeSlug: string, id: EntryRef) {
    const type = await this.types.row(space, typeSlug)
    const [entry] = await this.db
      .update(entries)
      .set({ scheduledAt: null, scheduledVersion: null, lastSchedule: null })
      .where(this.byId(type, id))
      .returning(entryColumns)
    if (!entry) throw new NotFoundException('Entrée introuvable')
    return entry
  }

  /** Publications programmées arrivées à l'heure, chaque minute (architecture, « Exécution »).
   *  Une publication manquée pendant un arrêt part au premier passage après le redémarrage.
   *  `skip locked` : deux instances de l'API ne publient pas deux fois la même entrée. */
  @Cron('* * * * *')
  async publishDue() {
    const spaces = await this.db.transaction(async (tx) => {
      const due = await tx
        .select({ entry: entries, type: contentTypes })
        .from(entries)
        .innerJoin(contentTypes, eq(contentTypes.id, entries.typeId))
        .where(lte(entries.scheduledAt, new Date()))
        .for('update', { of: entries, skipLocked: true })
      const published = new Set<string>()
      for (const { entry, type } of due) {
        const outcome = (result: 'published' | 'cancelled' | 'failed', message?: string) => ({
          plannedAt: entry.scheduledAt!.toISOString(),
          outcome: result,
          at: new Date().toISOString(),
          ...(message && { message }),
        })
        const done = { scheduledAt: null, scheduledVersion: null }
        // Garde-fou : une écriture qui change la version annule déjà la programmation.
        if (entry.version !== entry.scheduledVersion || !entry.draft) {
          await tx
            .update(entries)
            .set({ ...done, lastSchedule: outcome('cancelled') })
            .where(eq(entries.id, entry.id))
          continue
        }
        const slug = entry.draftSlug ?? entry.slug
        const issues = publicationIssues(type, entry.draft, slug)
        const failed = issues.length ? publicationMessage(issues) : null
        try {
          // Point de reprise : un identifiant pris entre-temps n'annule pas les autres publications.
          await tx.transaction(async (step) => {
            await step
              .update(entries)
              .set(
                failed
                  ? { ...done, lastSchedule: outcome('failed', failed) }
                  : {
                      ...done,
                      published: entry.draft,
                      draft: null,
                      slug,
                      draftSlug: null,
                      enComplete: isEnComplete(type.fields, entry.draft!),
                      publishedAt: new Date(),
                      version: sql`${entries.version} + 1`,
                      updatedAt: new Date(),
                      lastSchedule: outcome('published'),
                    },
              )
              .where(eq(entries.id, entry.id))
          })
          if (!failed) published.add(type.spaceId)
        } catch (err) {
          if (!isUniqueViolation(err)) throw err
          await tx
            .update(entries)
            .set({
              ...done,
              lastSchedule: outcome(
                'failed',
                'Cet identifiant d’URL est déjà utilisé par une autre entrée',
              ),
            })
            .where(eq(entries.id, entry.id))
        }
      }
      return published
    })
    // Ce que les sites affichent a changé : un build par espace (regroupé sur 10 s).
    for (const spaceId of spaces) this.deploy.schedule(spaceId)
  }

  /** Contrôles de « Publier » sur la version en cours d'édition ; renvoie l'identifiant d'URL
   *  qui sera mis en ligne. */
  private checkPublication(
    type: ContentType,
    entry: { draft: EntryData | null; slug: string | null; draftSlug: string | null },
  ) {
    const slug = entry.draftSlug ?? entry.slug
    const issues = publicationIssues(type, entry.draft!, slug)
    if (issues.length) {
      throw new BadRequestException({
        code: 'publication_invalid',
        message: publicationMessage(issues),
        issues,
      })
    }
    return slug
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
    /** Laisser le message « programmation annulée » si l'entrée était programmée. */
    notice = true,
  ) {
    try {
      const [entry] = await this.db
        .update(entries)
        .set({
          ...change,
          ...clearSchedule(notice),
          version: sql`${entries.version} + 1`,
          updatedAt: new Date(),
          updatedBy: user.id,
        })
        .where(and(eq(entries.id, id), eq(entries.version, version)))
        .returning(entryColumns)
      if (!entry) throw new ConflictException('Cette entrée a été modifiée ailleurs')
      return entry
    } catch (err) {
      // Publier ou dépublier met en ligne l'identifiant en attente : une autre entrée a pu le
      // prendre entre-temps.
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
