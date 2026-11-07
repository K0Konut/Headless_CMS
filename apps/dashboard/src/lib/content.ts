import type { ContentTypeInput, Field, FieldType } from '@dashility/shared'
import { slugify } from './slug'

/** Réponse de `GET /spaces/:slug/types`. */
export type ContentType = ContentTypeInput & { position: number; updatedAt: string }

/** Ligne de `GET /spaces/:slug/types` : le type et ses compteurs. */
export type ContentTypeSummary = ContentType & { counts: TypeCounts }

/** Libellés des champs et des choix enregistrés absents de la nouvelle définition : leurs
 *  valeurs seront effacées des entrées à l'enregistrement. */
export function removedFields(before: Field[], after: Field[]): string[] {
  return before.flatMap((old) => {
    const next = after.find((f) => f.key === old.key)
    if (!next) return [old.label]
    if (old.type === 'choice' && next.type === 'choice') {
      return old.choices
        .filter((c) => !next.choices.some((n) => n.key === c.key))
        .map((c) => `${old.label} : ${c.fr}`)
    }
    if (old.type === 'group' && next.type === 'group') {
      return removedFields(old.fields, next.fields).map((label) => `${old.label} : ${label}`)
    }
    return []
  })
}

/** Déplace un élément d'une liste d'un rang vers le haut (-1) ou vers le bas (1). */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1) {
  const [item] = list.splice(index, 1)
  list.splice(index + delta, 0, item!)
}

/** Noms des types de champs, dans l'ordre du document UX. */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texte court',
  richtext: 'Texte riche',
  choice: 'Liste de choix',
  date: 'Date ou période',
  link: 'Lien',
  list: 'Liste de valeurs',
  number: 'Nombre',
  boolean: 'Oui / non',
  image: 'Image',
  pdf: 'Fichier PDF',
  group: 'Groupe répétable',
}

/** Identifiant de champ proposé à partir d'un libellé : « Lien vers le code » → « lien_vers_le_code ». */
export function fieldKey(label: string) {
  const key = slugify(label).replace(/-/g, '_')
  // 50 caractères au plus, préfixe compris (fieldKeySchema).
  const prefixed = /^[a-z]/.test(key) || !key ? key : `champ_${key}`
  return prefixed.slice(0, 50).replace(/_+$/, '')
}

/** Champ neuf du type choisi, avec les réglages par défaut. */
export function newField(type: FieldType): Field {
  const base = { key: '', label: '', required: false, translatable: false }
  switch (type) {
    case 'choice':
      return { ...base, type, choices: [{ key: '', fr: '', en: '' }] }
    case 'date':
      return { ...base, type, period: false, precision: 'month' }
    case 'number':
      return { ...base, type, decimals: false }
    case 'boolean':
      return { ...base, type, defaultValue: false }
    case 'group':
      return { ...base, type, fields: [] }
    default:
      return { ...base, type }
  }
}

/** Compteurs d'un type, renvoyés avec la liste des types (écran Contenu). */
export interface TypeCounts {
  total: number
  published: number
  drafts: number
  modified: number
  enIncomplete: number
}

export type EntryStatus = 'draft' | 'published' | 'modified'

/** Ligne de `GET …/entries`. */
export interface EntrySummary {
  id: string
  slug: string | null
  title: string
  status: EntryStatus
  enComplete: boolean
  updatedAt: string
}

/** Réponse de `GET …/entries/:id`. */
export interface Entry {
  id: string
  slug: string | null
  published: Record<string, unknown> | null
  draft: Record<string, unknown> | null
  enComplete: boolean
  version: number
  publishedAt: string | null
  updatedAt: string
}

/** Statut affiché (document UX, « Statuts d'une entrée »). */
export const statusOf = (entry: Pick<Entry, 'published' | 'draft'>): EntryStatus =>
  !entry.published ? 'draft' : entry.draft ? 'modified' : 'published'

/** Adresse d'un lien acceptée à la publication. */
export function isValidLink(value: string) {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}
