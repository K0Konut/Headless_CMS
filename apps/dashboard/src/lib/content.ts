import type {
  ContentTypeInput,
  EntryData,
  EntryStatus,
  Field,
  FieldType,
  LastSchedule,
} from '@dashility/shared'
import {
  CalendarRange,
  CircleDot,
  FileType,
  Hash,
  Image,
  Link,
  Pilcrow,
  Rows3,
  Tags,
  ToggleRight,
  Type,
} from '@lucide/vue'
import type { Component, InjectionKey, Ref } from 'vue'
import { slugify } from './slug'

/** Fourni par l'éditeur d'entrée : vrai pendant une publication programmée (champs figés). Les
 *  saisies que le fieldset ne désactive pas (texte riche, glisser-déposer) le lisent. */
/** Champs en lecture seule mais lisibles : pas l'opacité réduite d'un champ désactivé. */
export const FROZEN = '[&_:disabled]:cursor-default [&_:disabled]:opacity-100'

export const READONLY_KEY: InjectionKey<Ref<boolean>> = Symbol('entry-readonly')

/** Un type tel que l'API le renvoie (liste, lecture, création, modification), avec ses compteurs. */
export type ContentType = ContentTypeInput & {
  position: number
  updatedAt: string
  counts: TypeCounts
  /** Dernière modification d'une de ses entrées, null sans entrée. */
  lastEntryUpdatedAt: string | null
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

/** Icône de chaque type de champ (direction visuelle, « Icônes »). */
export const FIELD_TYPE_ICONS: Record<FieldType, Component> = {
  text: Type,
  richtext: Pilcrow,
  choice: CircleDot,
  date: CalendarRange,
  link: Link,
  list: Tags,
  number: Hash,
  boolean: ToggleRight,
  image: Image,
  pdf: FileType,
  group: Rows3,
}

/** Exemple d'usage de chaque type de champ, dans la grille d'ajout (document UX, « Structure »). */
export const FIELD_TYPE_HINTS: Record<FieldType, string> = {
  text: 'Un titre, un nom, une accroche',
  richtext: 'Des paragraphes avec gras, liens, listes',
  choice: 'Une valeur parmi celles que vous définissez',
  date: 'Une date, ou un début et une fin',
  link: 'Une adresse web : démo, code, profil',
  list: 'Plusieurs mots-clés : une stack, des outils',
  number: 'Une quantité, un score, un pourcentage',
  boolean: 'Une option à cocher : à la une, en ligne',
  image: 'Une image avec son texte alternatif',
  pdf: 'Un document à télécharger : un CV',
  group: 'Des blocs de sous-champs : des étapes, des contraintes',
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
  scheduled: number
  /** Publiées avec des modifications non publiées. */
  modified: number
}

/** Ligne de `GET /spaces/:slug/todo` : une entrée qui demande une action. */
export interface TodoEntry {
  type: { slug: string; name: string; kind: 'collection' | 'single' }
  id: string
  title: string
  status: EntryStatus
  enComplete: boolean
  updatedAt: string
  scheduledAt: string | null
}

/** Ligne de `GET …/entries`. */
export interface EntrySummary {
  id: string
  slug: string | null
  title: string
  status: EntryStatus
  enComplete: boolean
  updatedAt: string
  scheduledAt: string | null
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
  /** Publication programmée (V3) : heure prévue, et issue de la dernière programmation. */
  scheduledAt: string | null
  lastSchedule: LastSchedule | null
}

/** Une version de l'historique (V4) : une par publication. */
export interface EntryVersion {
  number: number
  publishedAt: string
  /** Email de l'auteur ; null pour une publication programmée ou d'avant l'historique. */
  publishedBy: string | null
  scheduled: boolean
  /** La version que le site affiche. */
  online: boolean
}

/** Une entrée de la corbeille (V4). */
export interface TrashedEntry {
  id: string
  type: { slug: string; name: string }
  title: string
  deletedAt: string
  /** Email de qui l'a supprimée ; null pour un ancien membre. */
  deletedBy: string | null
  /** Suppression définitive prévue. */
  purgeAt: string
}
