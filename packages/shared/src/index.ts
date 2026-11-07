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

// ── Contenu (V2) : types et définitions de champs ──────────────────────────────────────

/** Types de champs (document UX, « Les types de champs »). */
export const FIELD_TYPES = [
  'text',
  'richtext',
  'choice',
  'date',
  'link',
  'list',
  'number',
  'boolean',
  'image',
  'pdf',
  'group',
] as const
export type FieldType = (typeof FIELD_TYPES)[number]

/** Seuls ces champs ont une valeur par langue ; une image a toujours ses deux textes
 *  alternatifs, un choix a ses libellés FR et EN dans sa définition. */
export const TRANSLATABLE_FIELD_TYPES: readonly FieldType[] = [
  'text',
  'richtext',
  'link',
  'list',
  'pdf',
]

/** Identifiant d'un champ ou d'un choix : clé dans les valeurs et dans l'API publique. */
export const fieldKeySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Identifiant : minuscules, chiffres et _, en commençant par une lettre',
  )
  .max(50)

const label = z.string().trim().min(1, 'Libellé obligatoire').max(100)

const fieldBase = {
  key: fieldKeySchema,
  label,
  required: z.boolean(),
  translatable: z.boolean(),
}

const choiceSchema = z.object({
  key: fieldKeySchema,
  fr: z.string().trim().min(1, 'Libellé français obligatoire').max(100),
  en: z.string().trim().min(1, 'Libellé anglais obligatoire').max(100),
})

/** Champs autres qu'un groupe : ce sont aussi les sous-champs possibles d'un groupe. */
const simpleFieldSchema = z.discriminatedUnion('type', [
  z.object({
    ...fieldBase,
    type: z.literal('text'),
    maxLength: z.int().min(1).max(10_000).optional(),
  }),
  z.object({ ...fieldBase, type: z.literal('richtext') }),
  z.object({
    ...fieldBase,
    type: z.literal('choice'),
    choices: z
      .array(choiceSchema)
      .min(1, 'Ajoutez au moins un choix')
      .max(100)
      .refine(
        (choices) => new Set(choices.map((c) => c.key)).size === choices.length,
        'Deux choix ont le même identifiant',
      ),
  }),
  z.object({
    ...fieldBase,
    type: z.literal('date'),
    period: z.boolean(),
    precision: z.enum(['day', 'month']),
  }),
  z.object({ ...fieldBase, type: z.literal('link') }),
  z.object({ ...fieldBase, type: z.literal('list') }),
  z.object({ ...fieldBase, type: z.literal('number'), decimals: z.boolean() }),
  z.object({ ...fieldBase, type: z.literal('boolean'), defaultValue: z.boolean() }),
  z.object({ ...fieldBase, type: z.literal('image') }),
  z.object({ ...fieldBase, type: z.literal('pdf') }),
])

/** Clés uniques dans une liste de champs, et règles qui ne tiennent pas dans le schéma d'un champ. */
function checkFields(
  fields: { key: string; type: FieldType; translatable: boolean }[],
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>()
  fields.forEach((field, i) => {
    if (seen.has(field.key)) {
      ctx.addIssue({
        code: 'custom',
        path: [i, 'key'],
        message: `Identifiant « ${field.key} » en double`,
      })
    }
    seen.add(field.key)
    if (field.translatable && !TRANSLATABLE_FIELD_TYPES.includes(field.type)) {
      ctx.addIssue({
        code: 'custom',
        path: [i, 'translatable'],
        message: 'Ce type de champ ne se traduit pas',
      })
    }
  })
}

const groupFieldSchema = z
  .object({
    ...fieldBase,
    type: z.literal('group'),
    // Un groupe ne contient pas d'autre groupe (document UX).
    fields: z
      .array(simpleFieldSchema)
      .min(1, 'Ajoutez au moins un sous-champ')
      .max(50)
      .superRefine(checkFields),
    min: z.int().min(0).max(100).optional(),
    max: z.int().min(1).max(100).optional(),
  })
  .refine((g) => g.min === undefined || g.max === undefined || g.min <= g.max, {
    message: 'Le minimum dépasse le maximum',
    path: ['max'],
  })

export const fieldSchema = z.union([simpleFieldSchema, groupFieldSchema])
export type Field = z.infer<typeof fieldSchema>
export type GroupField = z.infer<typeof groupFieldSchema>

const fieldsSchema = z.array(fieldSchema).max(100).superRefine(checkFields)

const contentTypeSchema = z.object({
  slug: slugSchema,
  kind: z.enum(['collection', 'single']),
  name: label,
  // « un projet » : seulement pour une collection, dans « Ajouter un projet ».
  entryLabel: z.string().trim().min(1).max(100).nullable(),
  fields: fieldsSchema,
})

/** Une collection a un nom d'entrée (« un projet »), une page unique n'en a pas. */
const entryLabelMatchesKind = (t: { kind: string; entryLabel: string | null }) =>
  (t.kind === 'collection') === (t.entryLabel !== null)
const entryLabelIssue = {
  message: 'Une collection a un nom d’entrée, une page unique n’en a pas',
  path: ['entryLabel'],
}

/** Corps de `POST /spaces/:slug/types`. Un type sans champ est permis : il n'apparaît pas dans
 *  Contenu tant qu'il n'en a aucun. */
export const createContentTypeSchema = contentTypeSchema.refine(
  entryLabelMatchesKind,
  entryLabelIssue,
)
export type ContentTypeInput = z.infer<typeof createContentTypeSchema>

/** Corps de `PUT /spaces/:slug/types/:type`. L'identifiant est dans l'URL ; la nature est
 *  renvoyée pour que la même règle s'applique, et l'API refuse qu'elle change. */
export const updateContentTypeSchema = contentTypeSchema
  .omit({ slug: true })
  .refine(entryLabelMatchesKind, entryLabelIssue)

/** Corps de `PUT /spaces/:slug/type-order` : tous les types de l'espace, dans le nouvel ordre. */
export const typeOrderSchema = z.object({ slugs: z.array(slugSchema).max(200) })

/** Ce qui ne change plus après la création d'un champ : son type, son caractère traduisible,
 *  et, pour un groupe, la même règle sur ses sous-champs. Renvoie le premier écart, ou null. */
export function frozenFieldChange(before: Field[], after: Field[]): string | null {
  for (const old of before) {
    const next = after.find((f) => f.key === old.key)
    if (!next) continue
    if (next.type !== old.type) return `Le type du champ « ${old.key} » ne peut plus changer`
    if (next.translatable !== old.translatable) {
      return `Le champ « ${old.key} » ne peut plus devenir ${old.translatable ? 'non traduisible' : 'traduisible'}`
    }
    if (old.type === 'group' && next.type === 'group') {
      const inner = frozenFieldChange(old.fields, next.fields)
      if (inner) return inner
    }
  }
  return null
}

// ── Contenu (V2) : valeurs des entrées ─────────────────────────────────────────────────

/** Date au mois (`2026-10`) ou au jour (`2026-10-14`). */
const partialDate = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Date invalide')

/** Valeur d'un champ dans une langue, en brouillon : seule la forme est vérifiée, tout peut être
 *  vide. Le format d'un lien et les champs obligatoires sont vérifiés à la publication. */
function languageValueSchema(field: Field): z.ZodType {
  switch (field.type) {
    case 'text':
      return z.string().max(10_000)
    case 'link':
      return z.string().max(2048)
    case 'list':
      return z.array(z.string().trim().min(1).max(200)).max(200)
    case 'choice':
      return z.enum(field.choices.map((c) => c.key) as [string, ...string[]]).nullable()
    case 'date':
      return z
        .object({
          start: partialDate.optional(),
          end: partialDate.optional(),
          ongoing: z.boolean().optional(),
        })
        .strict()
    case 'number':
      return z.number().finite().nullable()
    case 'boolean':
      return z.boolean()
    case 'group':
      return z.array(entryDataSchema(field.fields)).max(100)
    default:
      // shortcut: texte riche, image et PDF arrivent aux étapes 4 et 5 de la V2 ; d'ici là, un
      // tel champ reste vide
      return z.never()
  }
}

const fieldValueSchema = (field: Field) =>
  field.translatable
    ? z
        .object({
          fr: languageValueSchema(field).optional(),
          en: languageValueSchema(field).optional(),
        })
        .strict()
    : languageValueSchema(field)

/** Valeurs d'une entrée (brouillon) : un objet indexé par identifiant de champ, sans clé inconnue. */
export function entryDataSchema(fields: Field[]): z.ZodType<Record<string, unknown>> {
  return z
    .object(Object.fromEntries(fields.map((f) => [f.key, fieldValueSchema(f).optional()])))
    .strict()
}

export type EntryData = Record<string, unknown>

const isFilled = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  !(typeof value === 'string' && !value.trim()) &&
  !(Array.isArray(value) && !value.length)

/** Les champs obligatoires traduisibles ont leur valeur anglaise, dans les groupes aussi : sinon
 *  l'entrée est masquée sur le site en anglais (PRD, « Langues »). */
export function isEnComplete(fields: Field[], data: EntryData): boolean {
  return fields.every((field) => {
    const value = data[field.key]
    if (field.type === 'group') {
      return ((value as EntryData[] | undefined) ?? []).every((item) =>
        isEnComplete(field.fields, item),
      )
    }
    return (
      !field.required ||
      !field.translatable ||
      isFilled((value as { en?: unknown } | undefined)?.en)
    )
  })
}

/** Ne garde que les valeurs encore valides pour la définition : un champ supprimé, un choix
 *  retiré ou un sous-champ disparu perdent leur valeur quand la structure change. */
export function pruneEntryData(fields: Field[], data: EntryData): EntryData {
  const kept: EntryData = {}
  for (const field of fields) {
    let value = data[field.key]
    if (value === undefined) continue
    if (field.type === 'group' && Array.isArray(value)) {
      value = value.map((item: EntryData) => pruneEntryData(field.fields, item))
    }
    if (fieldValueSchema(field).safeParse(value).success) kept[field.key] = value
  }
  return kept
}

/** Titre d'une entrée dans les listes : la valeur française du premier champ « texte court ». */
export function entryTitle(fields: Field[], data: EntryData): string {
  const field = fields.find((f) => f.type === 'text')
  const value = field && data[field.key]
  const text = field?.translatable ? (value as { fr?: string } | undefined)?.fr : value
  return typeof text === 'string' ? text.trim() : ''
}

/** Corps de `PATCH …/entries/:id` (sauvegarde automatique). `version` est celle lue : si l'entrée a
 *  changé depuis, l'API répond 409. `data` est validé avec `entryDataSchema` du type. */
export const saveEntrySchema = z.object({
  version: z.int().min(1),
  data: z.record(z.string(), z.unknown()),
  slug: slugSchema.nullable().optional(),
})
