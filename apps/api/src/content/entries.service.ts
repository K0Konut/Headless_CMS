import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  entryDataSchema,
  entryPruner,
  entryStatus,
  entryTitle,
  isEnComplete,
  mediaRefs,
  publicationIssues,
  publicationMessage,
  type saveEntrySchema,
  type scheduleEntrySchema,
  scheduleIssue,
  type LastSchedule,
  type EntryData,
  previewLink,
} from '@dashility/shared'
import { and, desc, eq, isNotNull, lte, ne, or, sql } from 'drizzle-orm'
import { Cron } from '@nestjs/schedule'
import type { z } from 'zod'
import { DB } from '../db/db.module.js'
import { isUniqueViolation } from '../db/errors.js'
import type { Db, Tx, User } from '../db/index.js'
import { hashToken, newToken } from '../auth/tokens.js'
import { contentTypes, entries, entryVersions, previewLinks, users } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'
import { DeployService } from '../deploy/deploy.service.js'
import { MediaService } from '../media/media.service.js'
import { SLUG_TAKEN, nextVersion } from './schedule.js'
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

/** Contrôles de « Publier », et ce que la publication écrit : la même pour « Publier » et pour
 *  une publication programmée (architecture, « Exécution »). `change` est null s'il n'y a rien à
 *  publier (pas de modification en attente). */
function publication(
  type: ContentType,
  entry: { draft: EntryData | null; slug: string | null; draftSlug: string | null },
) {
  const slug = entry.draftSlug ?? entry.slug
  const draft = entry.draft
  return {
    issues: draft ? publicationIssues(type, draft, slug) : [],
    change: draft && {
      published: draft,
      draft: null,
      slug,
      draftSlug: null,
      enComplete: isEnComplete(type.fields, draft),
      publishedAt: new Date(),
    },
  }
}

/** Historique (V4) : la version publiée, numérotée à la suite des autres, dans la transaction de
 *  la publication (la ligne de l'entrée y est verrouillée par l'écriture). `by` est null pour une
 *  publication programmée. */
function recordVersion(tx: Tx, entryId: string, data: EntryData, by: string | null) {
  return tx.insert(entryVersions).values({
    entryId,
    data,
    publishedBy: by,
    scheduled: !by,
    number: sql`(select coalesce(max(${entryVersions.number}), 0) + 1 from ${entryVersions} where ${entryVersions.entryId} = ${entryId})`,
  })
}

/** Ce que l'API renvoie d'une version, sans son contenu. */
const versionColumns = {
  number: entryVersions.number,
  publishedAt: entryVersions.publishedAt,
  publishedBy: users.email,
  scheduled: entryVersions.scheduled,
}

const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000

/** Une entrée d'une collection (identifiant validé par la route), ou celle d'une page unique. */
export type EntryRef = string | 'single'

@Injectable()
export class EntriesService {
  private readonly logger = new Logger(EntriesService.name)

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

  /** Entrées qui demandent une action, tous types confondus, la dernière modifiée d'abord
   *  (document UX, « Contenu ») : brouillon ou modifications non publiées, EN incomplet,
   *  publication programmée. */
  async todo(space: Space) {
    const rows = await this.db
      .select({ entry: entryColumns, type: contentTypes })
      .from(entries)
      .innerJoin(contentTypes, eq(contentTypes.id, entries.typeId))
      .where(
        and(
          eq(contentTypes.spaceId, space.id),
          // Un type sans champ est masqué dans Contenu (document UX, « Structure »).
          sql`jsonb_array_length(${contentTypes.fields}) > 0`,
          or(
            isNotNull(entries.draft),
            eq(entries.enComplete, false),
            isNotNull(entries.scheduledAt),
          ),
        ),
      )
      .orderBy(desc(entries.updatedAt))
    return rows.map(({ entry, type }) => ({
      type: { slug: type.slug, name: type.name, kind: type.kind },
      id: entry.id,
      title:
        type.kind === 'single'
          ? type.name
          : entryTitle(type.fields, entry.draft ?? entry.published ?? {}),
      status: entryStatus(entry),
      enComplete: entry.enComplete,
      updatedAt: entry.updatedAt,
      scheduledAt: entry.scheduledAt,
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

  /** Lien d'aperçu (V3) : la page d'aperçu du site avec un nouveau jeton, valable 24 h. Le
   *  jeton donne accès à cette seule entrée, en lecture ; seule son empreinte est gardée. */
  async preview(space: Space, typeSlug: string, id: EntryRef) {
    if (!space.previewUrl) {
      throw new ConflictException({
        code: 'preview_not_configured',
        message: 'Aucune URL d’aperçu : configurez-la dans Réglages › Intégration',
      })
    }
    const type = await this.types.row(space, typeSlug)
    const [entry] = await this.db
      .select({ id: entries.id })
      .from(entries)
      .where(this.byId(type, id))
    if (!entry) throw new NotFoundException('Entrée introuvable')
    const token = newToken()
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS)
    await this.db
      .insert(previewLinks)
      .values({ id: hashToken(token), entryId: entry.id, expiresAt })
    return { url: previewLink(space.previewUrl, token), expiresAt }
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
        slugError = SLUG_TAKEN
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
          // Programmée entre la lecture et l'écriture : la modification l'annule.
          ...nextVersion(),
          updatedAt: new Date(),
          updatedBy: user.id,
        })
        .where(and(eq(entries.id, current.id), eq(entries.version, body.version)))
        .returning(entryColumns)
      if (!entry) throw new ConflictException('Cette entrée a été modifiée ailleurs')
      return slugError ? { ...entry, slugError } : entry
    } catch (err) {
      // Pris entre la vérification et l'écriture : cas rare, signalé sans perdre la suite.
      if (isUniqueViolation(err)) throw new BadRequestException(SLUG_TAKEN)
      throw err
    }
  }

  /** « Publier » : la version en cours d'édition (`draft`) devient la version en ligne, après les
   *  contrôles de publication (document UX, « Publier »). */
  async publish(space: Space, typeSlug: string, id: EntryRef, version: number, user: User) {
    const type = await this.types.row(space, typeSlug)
    const current = await this.current(type, id, version)
    const change = this.checkPublication(type, current)
    // Publier tout de suite retire la programmation, sans message : c'est la publication voulue.
    const entry = await this.write(current.id, version, user, change, false)
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

  /** Versions publiées (V4), la plus récente d'abord, sans leur contenu. */
  async versions(space: Space, typeSlug: string, id: EntryRef) {
    const entry = await this.get(space, typeSlug, id)
    const rows = await this.db
      .select(versionColumns)
      .from(entryVersions)
      .leftJoin(users, eq(users.id, entryVersions.publishedBy))
      .where(eq(entryVersions.entryId, entry.id))
      .orderBy(desc(entryVersions.number))
    // Toute publication crée une version (`write`, `publishDue`) et « Dépublier » vide `published` :
    // la plus récente est en ligne tant que l'entrée est publiée.
    return rows.map((row, i) => ({ ...row, online: i === 0 && !!entry.published }))
  }

  /** Une version, avec son contenu, pour la relire en lecture seule. */
  async version(space: Space, typeSlug: string, id: EntryRef, number: number) {
    const type = await this.types.row(space, typeSlug)
    const [row] = await this.db
      .select({ ...versionColumns, data: entryVersions.data })
      .from(entryVersions)
      .innerJoin(entries, eq(entries.id, entryVersions.entryId))
      .leftJoin(users, eq(users.id, entryVersions.publishedBy))
      .where(and(this.byId(type, id), eq(entryVersions.number, number)))
    if (!row) throw new NotFoundException('Version introuvable')
    return row
  }

  /** « Restaurer cette version » : son contenu remplace le brouillon, élagué selon la structure
   *  actuelle du type. Rien n'est publié : on relit, puis on publie (document UX). */
  async restore(
    space: Space,
    typeSlug: string,
    id: EntryRef,
    number: number,
    version: number,
    user: User,
  ) {
    const type = await this.types.row(space, typeSlug)
    const current = await this.current(type, id, version)
    const { data: saved } = await this.version(space, typeSlug, id, number)
    // Élaguée selon les champs actuels, elle reste valide pour le type (`entryPruner`).
    const data = entryPruner(type.fields)(saved)
    return this.write(current.id, version, user, {
      draft: data,
      enComplete: isEnComplete(type.fields, data),
    })
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
    const at = new Date(body.at)
    const issue = scheduleIssue(at)
    if (issue) throw new BadRequestException(issue)
    this.checkPublication(type, current)
    const [entry] = await this.db
      .update(entries)
      .set({ scheduledAt: at, lastSchedule: null })
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
      .set({ scheduledAt: null, lastSchedule: null })
      // Déjà publiée par la tâche (ou annulée ailleurs) : ne pas effacer l'issue ni annoncer une
      // annulation qui n'a pas eu lieu.
      .where(and(this.byId(type, id), isNotNull(entries.scheduledAt)))
      .returning(entryColumns)
    if (entry) return entry
    await this.get(space, typeSlug, id)
    throw new ConflictException({
      code: 'not_scheduled',
      message: 'Cette entrée n’est plus programmée : elle a peut-être déjà été publiée',
    })
  }

  /** Publications programmées arrivées à l'heure, chaque minute (architecture, « Exécution »).
   *  Une publication manquée pendant un arrêt part au premier passage après le redémarrage.
   *  `skip locked` : deux instances de l'API ne publient pas deux fois la même entrée. */
  @Cron('* * * * *')
  async publishDue() {
    // Une minute sans rien à publier coûte une requête, sans transaction ni verrou.
    const [any] = await this.db
      .select({ id: entries.id })
      .from(entries)
      .where(lte(entries.scheduledAt, new Date()))
      .limit(1)
    if (!any) return

    const spaces = await this.db.transaction(async (tx) => {
      const due = await tx
        .select({ entry: entries, type: contentTypes })
        .from(entries)
        .innerJoin(contentTypes, eq(contentTypes.id, entries.typeId))
        .where(lte(entries.scheduledAt, new Date()))
        .for('update', { of: entries, skipLocked: true })
      const published = new Set<string>()
      for (const { entry, type } of due) {
        const outcome = (result: LastSchedule['outcome'], message?: string): LastSchedule => ({
          plannedAt: entry.scheduledAt!.toISOString(),
          outcome: result,
          at: new Date().toISOString(),
          ...(message && { message }),
        })
        /** Programmation terminée sans publication. */
        const end = (lastSchedule: LastSchedule) =>
          tx
            .update(entries)
            .set({ scheduledAt: null, lastSchedule })
            .where(eq(entries.id, entry.id))

        try {
          const { issues, change } = publication(type, entry)
          // Une règle a changé depuis la programmation : rien n'est publié. (Sans brouillon, rien
          // à publier : impossible, puisque l'écriture qui le retire annule la programmation.)
          if (!change || issues.length) {
            await end(outcome('failed', change ? publicationMessage(issues) : 'rien à publier'))
            continue
          }
          // Point de reprise : un identifiant pris entre-temps n'annule pas les autres publications.
          await tx.transaction(async (step) => {
            await step
              .update(entries)
              .set({
                ...change,
                ...nextVersion(false),
                lastSchedule: outcome('published'),
                updatedAt: new Date(),
              })
              .where(eq(entries.id, entry.id))
            await recordVersion(step, entry.id, change.published, null)
          })
          published.add(type.spaceId)
        } catch (err) {
          // Une entrée en erreur ne bloque pas les autres : elle est marquée en échec, et la tâche
          // ne la reprendra pas à la minute suivante.
          if (!isUniqueViolation(err)) this.logger.error(err)
          await end(outcome('failed', isUniqueViolation(err) ? SLUG_TAKEN : 'erreur interne'))
        }
      }
      return published
    })
    // Ce que les sites affichent a changé : un build par espace (regroupé sur 10 s).
    for (const spaceId of spaces) this.deploy.schedule(spaceId)
  }

  /** Contrôles de « Publier » ; renvoie le changement à écrire, ou lève l'erreur à afficher. */
  private checkPublication(
    type: ContentType,
    entry: { draft: EntryData | null; slug: string | null; draftSlug: string | null },
  ) {
    const { issues, change } = publication(type, entry)
    if (!change) throw new BadRequestException('Rien à publier : aucune modification en attente')
    if (issues.length) {
      throw new BadRequestException({
        code: 'publication_invalid',
        message: publicationMessage(issues),
        issues,
      })
    }
    return change
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
      // Une publication laisse sa version dans l'historique, dans la même transaction : aucune
      // publication par le dashboard ne peut l'oublier (la tâche de programmation fait de même).
      return await this.db.transaction(async (tx) => {
        const [entry] = await tx
          .update(entries)
          .set({
            ...change,
            ...nextVersion(notice),
            updatedAt: new Date(),
            updatedBy: user.id,
          })
          .where(and(eq(entries.id, id), eq(entries.version, version)))
          .returning(entryColumns)
        if (!entry) throw new ConflictException('Cette entrée a été modifiée ailleurs')
        if (change.published) await recordVersion(tx, id, change.published, user.id)
        return entry
      })
    } catch (err) {
      // Publier ou dépublier met en ligne l'identifiant en attente : une autre entrée a pu le
      // prendre entre-temps.
      if (isUniqueViolation(err)) throw new BadRequestException(SLUG_TAKEN)
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
