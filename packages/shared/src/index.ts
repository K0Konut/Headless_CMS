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

/** Page d'aperçu du site (V3) : le chemin est gardé. https, ou http en local pour tester un site
 *  en développement. */
export const previewUrlSchema = z
  .url({ protocol: /^https?$/, error: 'URL invalide (http ou https)' })
  .refine(
    (url) => url.startsWith('https:') || /^(localhost|127\.0\.0\.1)$/.test(new URL(url).hostname),
    'L’URL d’aperçu doit être en https (http seulement en local)',
  )

export const updateSpaceSchema = createSpaceSchema
  .partial()
  .extend({ previewUrl: previewUrlSchema.nullable().optional() })

/** Paramètre d'URL qui porte le jeton d'aperçu. */
export const PREVIEW_PARAM = 'dashility-preview'

/** Adresse de la page d'aperçu avec un jeton (un vrai, ou `essai` pour « Tester ») ; une adresse
 *  qui a déjà des paramètres les garde. */
export function previewLink(previewUrl: string, token: string) {
  const url = new URL(previewUrl)
  url.searchParams.set(PREVIEW_PARAM, token)
  return url.href
}

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

/** Les événements sont gardés 6 mois, en mois calendaires (purge nocturne de l'API). */
export const RETENTION_MONTHS = 6

const parisDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' })

/** Date du jour à Paris, `YYYY-MM-DD`. */
export const parisToday = (now = new Date()) => parisDate.format(now)

/** Date `YYYY-MM-DD` décalée de `days` jours. */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Plus ancienne date entière encore conservée : le jour limite de la purge est exclu. */
export function oldestDate(now = new Date()) {
  const d = new Date(`${parisToday(now)}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS)
  return addDays(d.toISOString().slice(0, 10), 1)
}

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

/** Mise en avant (V3) : les places, et les vues sous lesquelles une entrée n'est pas classée
 *  (PRD, « Score d'effet et mise en avant »). La période est celle de la rétention : 6 mois. */
export const FEATURED_PLACES = 3
export const FEATURED_MIN_VIEWS = 20

/** Adresse des pages d'un type sur le site : « /fr/projets/{slug} ». */
const pathTemplate = z
  .string()
  .trim()
  .max(200)
  .refine((path) => path.startsWith('/'), 'L’adresse commence par /')
  .refine((path) => path.split('{slug}').length === 2, 'L’adresse doit contenir {slug} une fois')

/** Réglages de mise en avant d'une collection : les adresses de ses pages, pour relier les vues
 *  aux entrées, et le champ « oui / non » qui force une entrée dans les places. */
export const featuringSchema = z.object({
  paths: z.object({ fr: pathTemplate, en: pathTemplate.optional() }),
  forceField: z.string().optional(),
})
export type Featuring = z.infer<typeof featuringSchema>

const contentTypeSchema = z.object({
  slug: slugSchema,
  kind: z.enum(['collection', 'single']),
  name: label,
  // « un projet » : seulement pour une collection, dans « Ajouter un projet ».
  entryLabel: z.string().trim().min(1).max(100).nullable(),
  fields: fieldsSchema,
  featuring: featuringSchema.nullable().default(null),
})

/** La mise en avant ne vaut que pour une collection, et son forçage pour un champ « oui / non »
 *  de premier niveau. */
function checkFeaturing(
  t: { kind: string; fields: Field[]; featuring: Featuring | null },
  ctx: z.RefinementCtx,
) {
  if (!t.featuring) return
  if (t.kind !== 'collection') {
    ctx.addIssue({
      code: 'custom',
      message: 'Seule une collection se met en avant',
      path: ['featuring'],
    })
  }
  const key = t.featuring.forceField
  if (key && !t.fields.some((f) => f.key === key && f.type === 'boolean')) {
    ctx.addIssue({
      code: 'custom',
      message: 'Le forçage doit être un champ « oui / non » du type',
      path: ['featuring', 'forceField'],
    })
  }
}

/** Une collection a un nom d'entrée (« un projet »), une page unique n'en a pas. */
const entryLabelMatchesKind = (t: { kind: string; entryLabel: string | null }) =>
  (t.kind === 'collection') === (t.entryLabel !== null)
const entryLabelIssue = {
  message: 'Une collection a un nom d’entrée, une page unique n’en a pas',
  path: ['entryLabel'],
}

/** Corps de `POST /spaces/:slug/types`. Un type sans champ est permis : il n'apparaît pas dans
 *  Contenu tant qu'il n'en a aucun. */
export const createContentTypeSchema = contentTypeSchema
  .refine(entryLabelMatchesKind, entryLabelIssue)
  .superRefine(checkFeaturing)
export type ContentTypeInput = z.infer<typeof createContentTypeSchema>

/** Corps de `PUT /spaces/:slug/types/:type`. L'identifiant est dans l'URL ; la nature est
 *  renvoyée pour que la même règle s'applique, et l'API refuse qu'elle change. */
export const updateContentTypeSchema = contentTypeSchema
  .omit({ slug: true })
  // Absent : la mise en avant enregistrée reste (un client d'avant la V3 ne l'efface pas).
  .extend({ featuring: featuringSchema.nullable().optional() })
  .refine(entryLabelMatchesKind, entryLabelIssue)
  .superRefine((t, ctx) => checkFeaturing({ ...t, featuring: t.featuring ?? null }, ctx))

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

/** Langues du contenu ; le français est la langue de référence (document UX). */
export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]

// ── Contenu (V2) : valeurs des entrées ─────────────────────────────────────────────────

/** Date au mois (`2026-10`) ou au jour (`2026-10-14`). */
const partialDate = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Date invalide')

// ── Texte riche : document Tiptap (JSON) ──────────────────────────────────────────────

/** Message d'une adresse refusée, pour un champ « lien » comme pour un lien de texte riche. */
export const LINK_ERROR = 'Adresse invalide : elle doit commencer par https://, http:// ou mailto:'

/** Adresse d'un lien de texte riche : http(s) ou mailto (architecture, « Texte riche »). */
const richtextHref = z
  .string()
  .max(2048)
  .refine((href) => isValidLink(href), LINK_ERROR)

/** Marques permises : gras, italique, lien, mise en avant (`<mark>` sur le site). Les attributs
 *  inconnus d'une marque ou d'un nœud sont retirés, pas refusés. */
const richtextMark = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z.object({ type: z.literal('highlight') }).strict(),
  z.object({ type: z.literal('link'), attrs: z.object({ href: richtextHref }) }).strict(),
])

const richtextText = z
  .object({
    type: z.literal('text'),
    // La taille d'un document est bornée par celle du corps de la requête (1 Mo, app.setup).
    text: z.string().min(1).max(200_000),
    marks: z.array(richtextMark).max(4).optional(),
  })
  .strict()

const inlineContent = z.array(richtextText).max(1000).optional()

type RichtextBlock =
  | { type: 'paragraph'; content?: z.infer<typeof richtextText>[] }
  | { type: 'heading'; attrs: { level: 2 | 3 }; content?: z.infer<typeof richtextText>[] }
  | { type: 'bulletList'; content: RichtextListItem[] }
  | { type: 'orderedList'; attrs?: { start?: number }; content: RichtextListItem[] }
type RichtextListItem = { type: 'listItem'; content: RichtextBlock[] }

const richtextParagraph = z
  .object({ type: z.literal('paragraph'), content: inlineContent })
  .strict()

const richtextHeading = z
  .object({
    type: z.literal('heading'),
    attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }),
    content: inlineContent,
  })
  .strict()

/** Un élément de liste contient ce que Tiptap y permet : paragraphes, intertitres et listes
 *  imbriquées. La profondeur est bornée (bien au-delà de l'usage) pour qu'un document ne puisse
 *  pas épuiser la pile de validation. */
function listSchemas(depth: number): z.ZodType<RichtextBlock>[] {
  if (depth === 0) return []
  const item = z
    .object({
      type: z.literal('listItem'),
      content: z
        .array(z.union([richtextParagraph, richtextHeading, ...listSchemas(depth - 1)]))
        .min(1)
        .max(100),
    })
    .strict()
  const items = z.array(item).min(1).max(500)
  return [
    z.object({ type: z.literal('bulletList'), content: items }).strict(),
    z
      .object({
        type: z.literal('orderedList'),
        attrs: z.object({ start: z.int().min(0).max(100_000).optional() }).optional(),
        content: items,
      })
      .strict(),
  ] as z.ZodType<RichtextBlock>[]
}

/** Document de texte riche : paragraphes, intertitres (h2, h3) et listes, avec les marques
 *  ci-dessus. C'est la liste de l'éditeur du dashboard : un document qui en sort n'est jamais
 *  refusé, et l'API refuse tout le reste. */
export const richtextSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(z.union([richtextParagraph, richtextHeading, ...listSchemas(10)])).max(1000),
  })
  .strict()
export type RichtextDoc = z.infer<typeof richtextSchema>

/** Un document de texte riche contient-il du texte ? Un paragraphe vide ne compte pas. */
export function richtextHasText(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const { text, content } = node as { text?: unknown; content?: unknown }
  if (typeof text === 'string' && text.trim()) return true
  return Array.isArray(content) && content.some(richtextHasText)
}

// ── Médias : images et PDF ────────────────────────────────────────────────────────────

/** 10 Mo au plus par fichier (document UX, « Les types de champs »). */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024
/** Types d'image acceptés ; le type réel est vérifié par l'API, pas seulement l'extension. */
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Largeurs des variantes d'une image : 640, 1280 et 1920 px, sans agrandir une image plus
 *  petite ; la plus grande variante est l'image elle-même quand elle fait moins de 1920 px.
 *  Les fichiers s'appellent `<largeur>.webp` et `<largeur>.avif`. */
export function imageWidths(width: number): number[] {
  const largest = Math.min(width, 1920)
  return [...[640, 1280].filter((w) => w < largest), largest]
}

/** Valeur d'un champ image : le fichier et ses textes alternatifs FR et EN. */
export const imageValueSchema = z
  .object({
    id: z.uuid(),
    alt: z.object({ fr: z.string().max(500), en: z.string().max(500) }).strict(),
  })
  .strict()
export type ImageValue = z.infer<typeof imageValueSchema>

/** Fichier envoyé, tel que l'API le décrit. */
export interface Media {
  id: string
  kind: 'image' | 'pdf'
  originalName: string
  width: number | null
  height: number | null
  bytes: number
  createdAt: string
}

/** Médias cités par des valeurs : l'API vérifie qu'ils appartiennent à l'espace et ont le bon
 *  type. */
export function mediaRefs(
  fields: Field[],
  data: EntryData,
): { id: string; kind: 'image' | 'pdf' }[] {
  return fields.flatMap((field) => {
    const value = data[field.key]
    if (field.type === 'group') {
      return ((value as EntryData[] | undefined) ?? []).flatMap((item) =>
        mediaRefs(field.fields, item),
      )
    }
    if (field.type !== 'image' && field.type !== 'pdf') return []
    const values = field.translatable
      ? Object.values((value as Record<string, unknown> | undefined) ?? {})
      : [value]
    return values.flatMap((v) => {
      const id = field.type === 'image' ? (v as ImageValue | null)?.id : v
      return typeof id === 'string' ? [{ id, kind: field.type as 'image' | 'pdf' }] : []
    })
  })
}

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
    case 'richtext':
      return richtextSchema.nullable()
    case 'image':
      return imageValueSchema.nullable()
    case 'pdf':
      return z.uuid().nullable()
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

/** Valeur présente pour ce champ : un texte riche sans texte (un paragraphe vide) est vide. */
const hasValue = (field: Field, value: unknown) =>
  field.type === 'richtext' ? richtextHasText(value) : isFilled(value)

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
    // Une image a toujours ses deux textes alternatifs (document UX, « Statuts d'une entrée »).
    if (field.type === 'image') {
      return !value || isFilled((value as ImageValue).alt?.en)
    }
    return (
      !field.required ||
      !field.translatable ||
      hasValue(field, (value as { en?: unknown } | undefined)?.en)
    )
  })
}

/** Élagueur des valeurs d'une entrée : il ne garde que les valeurs encore valides pour la
 *  définition (un champ supprimé, un choix retiré ou un sous-champ disparu perdent leur valeur
 *  quand la structure change). Les schémas sont construits une fois, pour toutes les entrées. */
export function entryPruner(fields: Field[]): (data: EntryData) => EntryData {
  const rules = fields.map((field) => ({
    field,
    schema: fieldValueSchema(field),
    items: field.type === 'group' ? entryPruner(field.fields) : undefined,
  }))
  return (data) => {
    const kept: EntryData = {}
    for (const { field, schema, items } of rules) {
      let value = data[field.key]
      if (value === undefined) continue
      if (items && Array.isArray(value)) value = value.map((item: EntryData) => items(item))
      if (schema.safeParse(value).success) kept[field.key] = value
    }
    return kept
  }
}

export type EntryStatus = 'draft' | 'published' | 'modified'

/** Statut affiché (document UX, « Statuts d'une entrée »), déduit des deux versions. */
export const entryStatus = (entry: {
  published: EntryData | null
  draft: EntryData | null
}): EntryStatus => (!entry.published ? 'draft' : entry.draft ? 'modified' : 'published')

/** Adresse d'un champ « lien » acceptée à la publication. */
export function isValidLink(value: string) {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** Titre d'une entrée dans les listes : la valeur française du premier champ « texte court ». */
export function entryTitle(fields: Field[], data: EntryData): string {
  const field = fields.find((f) => f.type === 'text')
  const value = field && data[field.key]
  const text = field?.translatable ? (value as { fr?: string } | undefined)?.fr : value
  return typeof text === 'string' ? text.trim() : ''
}

/** Identifiant d'URL d'une entrée de collection (`/projets/ce-portfolio` sur le site). */
export const entrySlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Minuscules, chiffres et tirets uniquement')
  .max(100)

/** Corps de `PATCH …/entries/:id` (sauvegarde automatique). `version` est celle lue : si l'entrée a
 *  changé depuis, l'API répond 409. `data` est validé avec `entryDataSchema` du type. */
export const saveEntrySchema = z.object({
  version: z.int().min(1),
  data: z.record(z.string(), z.unknown()),
  slug: entrySlugSchema.nullable().optional(),
})

// ── Contenu (V2) : publication ─────────────────────────────────────────────────────────

/** Ce qui empêche de publier : `path` mène à la valeur fautive (`title.fr`,
 *  `constraints.0.name.fr`, `slug` pour l'identifiant d'URL). */
export interface PublicationIssue {
  path: string
  message: string
}

const MONTH_DATE = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** Date existante à la précision du champ (pas de 31 février). */
function isValidPartialDate(value: string, precision: 'day' | 'month') {
  if (precision === 'month') return MONTH_DATE.test(value)
  return DAY_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
}

/** Erreurs de format d'une valeur dans une langue. Une valeur vide n'en a pas. */
function formatIssue(field: Field, value: unknown): { suffix?: string; message: string } | null {
  if (field.type === 'link' && typeof value === 'string' && value && !isValidLink(value)) {
    return { message: LINK_ERROR }
  }
  if (field.type === 'text' && field.maxLength && typeof value === 'string') {
    if (value.length > field.maxLength) {
      return { message: `${field.maxLength} caractères au plus` }
    }
  }
  if (field.type === 'number' && typeof value === 'number' && !field.decimals) {
    if (!Number.isInteger(value)) return { message: 'Nombre entier attendu' }
  }
  if (field.type === 'date' && value) {
    const { start, end, ongoing } = value as { start?: string; end?: string; ongoing?: boolean }
    if (start && !isValidPartialDate(start, field.precision)) {
      return { suffix: 'start', message: 'Date de début invalide' }
    }
    if (field.period && !ongoing && end) {
      if (!isValidPartialDate(end, field.precision)) {
        return { suffix: 'end', message: 'Date de fin invalide' }
      }
      if (start && end < start) return { suffix: 'end', message: 'La fin précède le début' }
    }
  }
  return null
}

/** Valeur absente pour la règle « obligatoire ». Une date a au moins son début ; un oui / non a
 *  toujours une valeur (sa valeur par défaut). */
function isMissing(field: Field, value: unknown) {
  if (field.type === 'boolean') return false
  if (field.type === 'date') return !(value as { start?: string } | undefined)?.start
  return !hasValue(field, value)
}

function collectIssues(fields: Field[], data: EntryData, prefix: string, out: PublicationIssue[]) {
  for (const field of fields) {
    const value = data[field.key]
    const path = `${prefix}${field.key}`
    if (field.type === 'group') {
      const items = Array.isArray(value) ? (value as EntryData[]) : []
      if (field.required && !items.length) {
        out.push({ path, message: 'Ajoutez au moins un élément' })
      } else if (items.length && field.min !== undefined && items.length < field.min) {
        out.push({ path, message: `Au moins ${field.min} éléments` })
      } else if (field.max !== undefined && items.length > field.max) {
        out.push({ path, message: `${field.max} éléments au plus` })
      }
      items.forEach((item, i) => collectIssues(field.fields, item, `${path}.${i}.`, out))
      continue
    }
    const langs = field.translatable
      ? (['fr', 'en'] as const).map((lang) => ({
          path: `${path}.${lang}`,
          value: (value as Record<string, unknown> | undefined)?.[lang],
          lang,
        }))
      : [{ path, value, lang: 'fr' as const }]
    for (const v of langs) {
      // Le français est la langue de référence : l'anglais manquant ne bloque pas (EN incomplet).
      if (v.lang === 'fr' && field.required) {
        if (isMissing(field, v.value)) {
          out.push({ path: v.path, message: 'Champ obligatoire' })
          continue
        }
      }
      // Le texte alternatif français d'une image présente est obligatoire, même si l'image ne l'est pas.
      if (field.type === 'image' && v.value && !isFilled((v.value as ImageValue).alt?.fr)) {
        out.push({ path: `${v.path}.alt.fr`, message: 'Texte alternatif obligatoire' })
      }
      const format = formatIssue(field, v.value)
      if (format) {
        out.push({
          path: format.suffix ? `${v.path}.${format.suffix}` : v.path,
          message: format.message,
        })
      }
    }
  }
}

/** Message d'une publication refusée, le même dans l'API et dans le dashboard. */
export function publicationMessage(issues: PublicationIssue[]) {
  return issues.length === 1
    ? `Publication impossible : ${issues[0]!.message.charAt(0).toLowerCase()}${issues[0]!.message.slice(1)}`
    : `Publication impossible : ${issues.length} champs à corriger`
}

/** Contrôles de publication (document UX, « Publier ») : champs obligatoires en français, formats
 *  (lien, nombre entier, dates, longueur, nombre d'éléments d'un groupe) et, pour une
 *  collection, l'identifiant d'URL. Liste vide : l'entrée peut être publiée. */
export function publicationIssues(
  type: { kind: 'collection' | 'single'; fields: Field[] },
  data: EntryData,
  slug: string | null,
): PublicationIssue[] {
  const issues: PublicationIssue[] = []
  if (type.kind === 'collection') {
    if (!slug) issues.push({ path: 'slug', message: 'Identifiant d’URL obligatoire pour publier' })
    else if (!entrySlugSchema.safeParse(slug).success) {
      issues.push({ path: 'slug', message: 'Minuscules, chiffres et tirets uniquement' })
    }
  }
  collectIssues(type.fields, data, '', issues)
  return issues
}

/** Corps des actions de publication (`publish`, `discard`, `unpublish`) : la version lue, pour
 *  ne pas publier ou annuler autre chose que ce que le membre a sous les yeux. */
export const entryActionSchema = z.object({ version: z.int().min(1) })

// ── Contenu (V2) : déploiement à la publication ───────────────────────────────────────

/** Corps de `PUT /spaces/:slug/deploy` (super-admin). L'URL doit être en https ; `null` retire le
 *  déploiement. Le jeton : absent, il reste tel quel ; `null` le retire ; une chaîne le remplace.
 *  Il n'est jamais renvoyé. */
export const deploySettingsSchema = z.object({
  url: z
    .url({ protocol: /^https$/, error: 'Adresse invalide : elle doit commencer par https://' })
    .max(2048)
    .nullable(),
  token: z.string().trim().min(1, 'Jeton vide').max(1000).nullable().optional(),
})

/** État du déploiement d'un espace (`GET /spaces/:slug/deploy`). */
export interface DeployState {
  /** Une URL de déploiement est enregistrée. */
  configured: boolean
  /** Un appel est attendu (regroupement de 10 s) ou en cours. */
  pending: boolean
  /** Dernier appel : heure, statut HTTP (null si le site était injoignable), réussite. */
  last: { at: string; status: number | null; ok: boolean } | null
  /** Super-admin seulement : l'URL et la présence d'un jeton (jamais sa valeur). */
  url?: string | null
  hasToken?: boolean
}

// ── Contenu (V3) : publication programmée ─────────────────────────────────────────────

/** Issue de la dernière programmation, pour le message de l'éditeur (document UX, « Après l'heure
 *  prévue »). Effacée à la prochaine écriture de l'entrée. */
export interface LastSchedule {
  plannedAt: string
  outcome: 'published' | 'cancelled' | 'failed'
  /** Heure réelle de l'issue : celle de la publication, de l'annulation ou du refus. */
  at: string
  /** Pour un refus : le message de la publication refusée. */
  message?: string
}

/** Corps de `PUT …/entries/:id/schedule`. `at` est un instant ISO ; ses bornes sont vérifiées par
 *  `scheduleIssue`, à la réception par l'API et dans le panneau du dashboard. */
export const scheduleEntrySchema = z.object({
  version: z.int().min(1),
  at: z.iso.datetime({ offset: true, error: 'Date de publication invalide' }),
})

const MINUTE_MS = 60_000
const YEAR_MS = 366 * 24 * 60 * MINUTE_MS

/** Bornes d'une publication programmée (document UX) : au moins une minute dans le futur, au plus
 *  un an. Renvoie le message à afficher, ou null. */
export function scheduleIssue(at: Date, now = Date.now()): string | null {
  if (Number.isNaN(at.getTime())) return 'Choisissez une date et une heure'
  if (at.getTime() < now + MINUTE_MS) return 'Choisissez une date à venir'
  if (at.getTime() > now + YEAR_MS) return 'Choisissez une date dans l’année qui vient'
  return null
}

const parisFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Date et heure de Paris d'un instant, en chiffres : `{ year: '2026', month: '11', day: '17',
 *  hour: '09', minute: '00' }`. */
export function parisParts(instant: Date | number) {
  const p = Object.fromEntries(parisFormat.formatToParts(instant).map((x) => [x.type, x.value]))
  return { year: p.year!, month: p.month!, day: p.day!, hour: p.hour!, minute: p.minute! }
}

/** Décalage de l'heure de Paris sur l'UTC à cet instant, en millisecondes. */
function parisOffset(instant: number) {
  const p = parisParts(instant)
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
  return wall - Math.floor(instant / 60_000) * 60_000
}

/** Instant d'une date (`2026-11-17`) et d'une heure (`09:00`) à l'heure de Paris, quel que soit le
 *  fuseau de l'ordinateur. Une heure qui n'existe pas (passage à l'heure d'été) est avancée à
 *  l'heure suivante ; une heure qui existe deux fois (passage à l'heure d'hiver) est la seconde. */
export function parisDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  const wall = Date.UTC(y!, m! - 1, d!, h!, min!)
  // Deux passes : le décalage dépend de l'instant cherché.
  const guess = wall - parisOffset(wall)
  return new Date(wall - parisOffset(guess))
}

/** Une entrée candidate à la mise en avant, avec ses vues et ses CV sur 6 mois. */
export interface FeaturingCandidate {
  id: string
  views: number
  cv: number
  forced: boolean
}
export type FeaturedReason = 'forced' | 'ranked' | 'drawn'

/**
 * Ordre de mise en avant (architecture, « V3 : mise en avant ») : les forcées (par score, puis
 * par vues), puis les classées (score = CV ÷ vues, à partir de 20 vues), puis les autres dans
 * l'ordre du tirage (`drawKey` croissant). Les `FEATURED_PLACES` premières sont mises en avant ;
 * la suite sert quand une entrée est sautée (incomplète en anglais).
 */
export function featuredOrder<T extends FeaturingCandidate>(
  rows: T[],
  drawKey: (row: T) => string = () => '',
) {
  const scored = rows.map((row) => ({
    ...row,
    score: row.views >= FEATURED_MIN_VIEWS ? row.cv / row.views : null,
  }))
  type Scored = (typeof scored)[number]
  const byScore = (a: Scored, b: Scored) => (b.score ?? -1) - (a.score ?? -1) || b.views - a.views
  const forced = scored.filter((r) => r.forced).sort(byScore)
  const ranked = scored.filter((r) => !r.forced && r.score !== null).sort(byScore)
  const drawn = scored
    .filter((r) => !r.forced && r.score === null)
    .map((row) => ({ row, key: drawKey(row) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ row }) => row)
  return [
    ...forced.map((r) => ({ ...r, reason: 'forced' as FeaturedReason, rank: null })),
    ...ranked.map((r, i) => ({ ...r, reason: 'ranked' as FeaturedReason, rank: i + 1 })),
    ...drawn.map((r) => ({ ...r, reason: 'drawn' as FeaturedReason, rank: null })),
  ]
}

/** Classement d'un type, pour l'onglet Analytics (`GET /spaces/:slug/analytics/featured`). */
export interface FeaturedSummary {
  type: { slug: string; name: string }
  rows: {
    id: string
    title: string
    views: number
    cv: number
    score: number | null
    forced: boolean
    rank: number | null
    /** Parmi les places : forcée ou classée. Les places tirées au hasard ne sont pas montrées. */
    featured: boolean
  }[]
  /** Places laissées au tirage, refait chaque jour. */
  drawnPlaces: number
}
