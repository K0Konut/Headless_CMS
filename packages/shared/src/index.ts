import { z } from 'zod'

/** Événement envoyé par le script de collecte vers `POST /api/e`. */
export const collectEventSchema = z.object({
  k: z.string().min(1).max(64),
  t: z.enum(['view', 'cv']),
  p: z.string().startsWith('/').max(512),
  // Une provenance illisible est écartée sans perdre la vue.
  r: z.hostname().optional().catch(undefined),
})

export type CollectEvent = z.infer<typeof collectEventSchema>

/** Emails toujours stockés et comparés en minuscules. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Adresse email invalide'))

/** 128 caractères au plus : au-delà, le hachage Argon2 devient un levier de déni de service. */
export const passwordSchema = z
  .string()
  .min(12, 'Le mot de passe doit faire au moins 12 caractères')
  .max(128, 'Le mot de passe doit faire au plus 128 caractères')

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
})

/** Slug d'espace, utilisé dans les URLs du dashboard (`/espaces/:slug`). */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Minuscules, chiffres et tirets uniquement')
  .max(50)
  // `/espaces/nouveau` est l'écran de création.
  .refine((slug) => slug !== 'nouveau', 'Ce slug est réservé')

/** URL du site réduite à son origine : c'est elle que la collecte compare à l'en-tête `Origin`. */
export const siteUrlSchema = z
  .url({ protocol: /^https?$/, error: 'URL invalide (http ou https)' })
  .transform((url) => new URL(url).origin)

export const createSpaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slugSchema,
  siteUrl: siteUrlSchema,
})

export const updateSpaceSchema = createSpaceSchema.partial()

export const invitationSchema = z.object({ email: emailSchema })

/** Corps de `POST /tokens/:token` : le mot de passe choisi par l'invité ou le membre. */
export const consumeTokenSchema = z.object({ password: passwordSchema })

const MAX_PERIOD_DAYS = 200

/** Période de l'onglet analytics : dates locales (Europe/Paris), bornes incluses. */
export const analyticsQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine((q) => q.from <= q.to, 'La date de début doit précéder la date de fin')
  .refine(
    (q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < MAX_PERIOD_DAYS,
    `La période ne peut pas dépasser ${MAX_PERIOD_DAYS} jours`,
  )
