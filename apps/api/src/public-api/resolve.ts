import {
  type EntryData,
  type Field,
  type ImageValue,
  type Locale,
  type RichtextDoc,
  imageWidths,
  richtextHasText,
} from '@dashility/shared'
import { richtextExtensions } from '@dashility/shared/richtext'
import { generateHTML } from '@tiptap/html'

/** Description d'un média nécessaire pour construire ses adresses. */
export interface MediaInfo {
  kind: 'image' | 'pdf'
  width: number | null
  height: number | null
  bytes: number
}

export interface ResolveContext {
  locale: Locale
  /** Origine publique du CMS (`https://dashility.costamask.dev`) : les adresses sont absolues. */
  origin: string
  media: Map<string, MediaInfo>
}

// Le même document est converti à chaque lecture (un build lit tout le contenu) : on garde le
// HTML des derniers documents vus. generateHTML ouvre un DOM complet à chaque appel. Le cache
// est borné en taille (clés et HTML compris), pas en nombre : un document peut peser 1 Mo.
const htmlCache = new Map<string, string>()
const HTML_CACHE_CHARS = 20_000_000
let cachedChars = 0

/** HTML d'un texte riche, ou null s'il n'a pas de texte (un paragraphe vide). */
function richtextHtml(value: unknown) {
  if (!richtextHasText(value)) return null
  const key = JSON.stringify(value)
  let html = htmlCache.get(key)
  if (html === undefined) {
    // Mêmes extensions que l'éditeur : seulement leurs balises, texte échappé.
    html = generateHTML(value as RichtextDoc, richtextExtensions)
    htmlCache.set(key, html)
    cachedChars += key.length + html.length
    for (const [oldKey, oldHtml] of htmlCache) {
      if (cachedChars <= HTML_CACHE_CHARS) break
      htmlCache.delete(oldKey)
      cachedChars -= oldKey.length + oldHtml.length
    }
  }
  return { html }
}

const url = (ctx: ResolveContext, id: string, file: string) =>
  `${ctx.origin}/api/media/${id}/${file}`

/** Image : texte alternatif dans la langue, dimensions, plus grande variante WebP en `src` et
 *  les deux jeux de variantes pour `<picture>` (architecture, « API publique de lecture »). */
function resolveImage(value: ImageValue | null | undefined, ctx: ResolveContext) {
  const info = value && ctx.media.get(value.id)
  if (!value || !info?.width || !info.height) return null
  const widths = imageWidths(info.width)
  const srcset = (format: 'webp' | 'avif') =>
    widths.map((w) => `${url(ctx, value.id, `${w}.${format}`)} ${w}w`).join(', ')
  return {
    alt: value.alt[ctx.locale],
    width: info.width,
    height: info.height,
    src: url(ctx, value.id, `${widths.at(-1)}.webp`),
    srcset: { webp: srcset('webp'), avif: srcset('avif') },
  }
}

/** Valeur d'un champ dans une langue ; une valeur vide vaut `null` (une liste vide, `[]`). */
function resolveValue(field: Exclude<Field, { type: 'group' }>, raw: unknown, ctx: ResolveContext) {
  const value = field.translatable
    ? (raw as Record<string, unknown> | undefined)?.[ctx.locale]
    : raw
  switch (field.type) {
    case 'text':
    case 'link':
      return typeof value === 'string' && value.trim() ? value : null
    case 'list':
      return Array.isArray(value) ? value : []
    case 'number':
      return typeof value === 'number' ? value : null
    case 'boolean':
      // Jamais touché : la valeur par défaut, celle que l'éditeur affichait.
      return typeof value === 'boolean' ? value : field.defaultValue
    case 'date':
      return (value as { start?: string } | undefined)?.start ? value : null
    case 'choice': {
      const choice = field.choices.find((c) => c.key === value)
      return choice ? { key: choice.key, label: choice[ctx.locale] } : null
    }
    case 'richtext':
      return richtextHtml(value)
    case 'image':
      return resolveImage(raw as ImageValue | null | undefined, ctx)
    case 'pdf': {
      const info = typeof value === 'string' ? ctx.media.get(value) : undefined
      return info ? { url: url(ctx, value as string, 'original.pdf'), bytes: info.bytes } : null
    }
  }
}

/** Valeurs d'une entrée résolues pour une langue, groupes compris. */
export function resolveData(fields: Field[], data: EntryData, ctx: ResolveContext) {
  return Object.fromEntries(
    fields.map((field): [string, unknown] => [
      field.key,
      field.type === 'group'
        ? ((data[field.key] as EntryData[] | null | undefined) ?? []).map((item) =>
            resolveData(field.fields, item, ctx),
          )
        : resolveValue(field, data[field.key], ctx),
    ]),
  )
}
