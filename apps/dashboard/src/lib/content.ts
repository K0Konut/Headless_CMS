import type { ContentTypeInput, Field, FieldType } from '@dashility/shared'
import { slugify } from './slug'

/** Réponse de `GET /spaces/:slug/types`. */
export type ContentType = ContentTypeInput & { position: number; updatedAt: string }

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
