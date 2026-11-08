import type { ContentTypeInput, EntryData, EntryStatus, Field, FieldType } from '@dashility/shared'
import { slugify } from './slug'

/** Un type tel que l'API le renvoie (liste, lecture, création, modification), avec ses compteurs. */
export type ContentType = ContentTypeInput & {
  position: number
  updatedAt: string
  counts: TypeCounts
}

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

/** Identifiants stables pour les éléments d'une liste réordonnable (clés de rendu) : à appeler
 *  avec l'élément lu dans la liste réactive, c'est-à-dire son proxy. */
export function stableIds() {
  const ids = new WeakMap<object, number>()
  let last = 0
  return (item: object) => ids.get(item) ?? (ids.set(item, ++last), last)
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

/** Compteurs d'un type (écran Contenu, confirmation dans Structure). */
export interface TypeCounts {
  total: number
  published: number
  enIncomplete: number
}

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
  /** Identifiant d'URL en ligne. */
  slug: string | null
  /** Identifiant modifié sur une entrée publiée, en attente de « Publier ». */
  draftSlug: string | null
  published: EntryData | null
  draft: EntryData | null
  version: number
  publishedAt: string | null
  updatedAt: string
}
