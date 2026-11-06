import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
  (t) => [index('events_space_created_idx').on(t.spaceId, t.createdAt)],
)
