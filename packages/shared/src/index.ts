import { z } from 'zod'

/** Événement envoyé par le script de collecte vers `POST /api/e`. */
export const collectEventSchema = z.object({
  k: z.string().min(1).max(64),
  t: z.enum(['view', 'cv']),
  p: z.string().startsWith('/').max(512),
  r: z.hostname().optional(),
})

export type CollectEvent = z.infer<typeof collectEventSchema>

/** Emails toujours stockés et comparés en minuscules. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

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
