import type { EntryData, Featuring, Field, LastSchedule } from '@dashility/shared'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [check('users_email_lowercase', sql`${t.email} = lower(${t.email})`)],
)

/** `id` = empreinte SHA-256 du jeton de session, jamais le jeton lui-même. */
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  /** Origine autorisée pour la collecte. */
  siteUrl: text('site_url').notNull(),
  /** Identifiant public envoyé par le script de collecte. */
  publicKey: text('public_key').notNull().unique(),
  /** Clé de l'API de lecture (V2) : seulement son empreinte SHA-256, comme les sessions. */
  apiKeyHash: text('api_key_hash').unique(),
  apiKeyCreatedAt: timestamp('api_key_created_at', { withTimezone: true }),
  /** URL appelée après une publication (hook de build), et son jeton facultatif, gardé en clair
   *  puisqu'il faut l'envoyer ; jamais renvoyé par l'API. */
  deployUrl: text('deploy_url'),
  deployToken: text('deploy_token'),
  /** Dernier appel : heure et statut HTTP (null : site injoignable). */
  deployCalledAt: timestamp('deploy_called_at', { withTimezone: true }),
  deployStatus: integer('deploy_status'),
  /** Page d'aperçu du site (V3), qui reçoit `?dashility-preview=<jeton>` ; null : pas d'aperçu. */
  previewUrl: text('preview_url'),
  createdAt: createdAt(),
})

export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.spaceId] })],
)

/** Invitations (`space_id`) et réinitialisations (`user_id`). `id` = empreinte SHA-256 du jeton. */
export const tokens = pgTable(
  'tokens',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['invitation', 'reset'] }).notNull(),
    email: text('email').notNull(),
    spaceId: uuid('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'tokens_kind_target',
      sql`(${t.kind} = 'invitation' and ${t.spaceId} is not null) or (${t.kind} = 'reset' and ${t.userId} is not null)`,
    ),
  ],
)

export const events = pgTable(
  'events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['view', 'cv'] }).notNull(),
    path: text('path').notNull(),
    /** Domaine de provenance, vide pour un accès direct. */
    referrer: text('referrer').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [
    index('events_space_created_idx').on(t.spaceId, t.createdAt),
    // Mise en avant (V3) : vues et CV des pages des entrées.
    index('events_space_path_idx').on(t.spaceId, t.path),
  ],
)

/** Types de contenu d'un espace (V2). `slug` et `kind` sont figés après la création ;
 *  `fields` est validé par `fieldSchema` (packages/shared). */
export const contentTypes = pgTable(
  'content_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    kind: text('kind', { enum: ['collection', 'single'] }).notNull(),
    name: text('name').notNull(),
    /** « un projet » pour une collection, null pour une page unique. */
    entryLabel: text('entry_label'),
    position: integer('position').notNull(),
    fields: jsonb('fields').$type<Field[]>().notNull(),
    /** Mise en avant (V3) : adresses des pages sur le site et champ de forçage ; null sinon. */
    featuring: jsonb('featuring').$type<Featuring>(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('content_types_space_slug').on(t.spaceId, t.slug)],
)

/** Entrées d'un type (V2). Le statut se déduit de `published` et `draft` (architecture technique,
 *  « Modèle de données ») : le site ne lit que `published`. Une page unique a une seule entrée,
 *  créée avec son type ; `slug` ne sert qu'aux collections (null tant qu'il n'est pas choisi). */
export const entries = pgTable(
  'entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    typeId: uuid('type_id')
      .notNull()
      .references(() => contentTypes.id, { onDelete: 'cascade' }),
    slug: text('slug'),
    /** Identifiant d'URL modifié sur une entrée publiée : comme `draft`, il n'est en ligne
     *  qu'après « Publier » (le site lit `slug`). Null s'il n'y a pas de changement en attente. */
    draftSlug: text('draft_slug'),
    published: jsonb('published').$type<EntryData>(),
    draft: jsonb('draft').$type<EntryData>(),
    /** Calculé à chaque écriture, sur la version la plus récente (brouillon, sinon publiée). */
    enComplete: boolean('en_complete').notNull(),
    /** Contrôle des écritures concurrentes : chaque sauvegarde envoie la version lue. */
    version: integer('version').notNull().default(1),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    /** Publication programmée (V3) : heure prévue. La version programmée est la version actuelle,
     *  puisque tout changement de version annule la programmation (`nextVersion`). */
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    /** Issue de la dernière programmation, effacée à la prochaine écriture. */
    lastSchedule: jsonb('last_schedule').$type<LastSchedule>(),
  },
  (t) => [
    unique('entries_type_slug').on(t.typeId, t.slug),
    // La tâche de chaque minute ne lit que les entrées programmées.
    index('entries_scheduled_at_idx')
      .on(t.scheduledAt)
      .where(sql`${t.scheduledAt} is not null`),
    check('entries_has_data', sql`${t.published} is not null or ${t.draft} is not null`),
  ],
)

/** Historique (V4) : une version par publication, ce qui est parti en ligne, pour le relire et le
 *  restaurer. La version « en ligne » est la plus récente, si l'entrée est publiée. */
export const entryVersions = pgTable(
  'entry_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    /** 1, 2, 3… pour chaque entrée. */
    number: integer('number').notNull(),
    /** Valeurs des champs publiées, comme `entries.published` ; pas l'identifiant d'URL. */
    data: jsonb('data').$type<EntryData>().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null : publication programmée, ancien membre, ou version d'avant l'historique. */
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    scheduled: boolean('scheduled').notNull().default(false),
  },
  (t) => [unique('entry_versions_entry_number').on(t.entryId, t.number)],
)

/** Images et PDF envoyés dans les champs des entrées (V2). Les fichiers sont sur le NAS, dans
 *  `<MEDIA_DIR>/<id de l'espace>/<id>/` ; la table n'en garde que la description. */
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['image', 'pdf'] }).notNull(),
    /** Nom du fichier envoyé, pour l'affichage et le téléchargement ; jamais utilisé comme chemin. */
    originalName: text('original_name').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('media_space_created_idx').on(t.spaceId, t.createdAt),
    check(
      'media_image_size',
      sql`(${t.kind} = 'image') = (${t.width} is not null and ${t.height} is not null)`,
    ),
  ],
)

/** Liens d'aperçu (V3) : un par clic sur « Prévisualiser », valables 24 h, non révocables.
 *  `id` = empreinte SHA-256 du jeton. `entry_id` passe à null quand l'entrée est supprimée, pour
 *  répondre « entrée supprimée » plutôt que « lien invalide ». */
export const previewLinks = pgTable('preview_links', {
  id: text('id').primaryKey(),
  entryId: uuid('entry_id').references(() => entries.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
