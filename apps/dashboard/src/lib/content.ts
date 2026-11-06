import type { Field, FieldType } from '@dashility/shared'
import { slugify } from './slug'

/** Réponse de `GET /spaces/:slug/types`. */
export interface ContentType {
  slug: string
  kind: 'collection' | 'single'
  name: string
  entryLabel: string | null
  position: number
  fields: Field[]
  updatedAt: string
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
  return /^[a-z]/.test(key) ? key : key ? `champ_${key}` : ''
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
