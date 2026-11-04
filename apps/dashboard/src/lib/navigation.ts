import type { Me, SpaceSummary } from './types'

const LAST_SPACE = 'cms:dernier-espace'

/** Commodité seulement : le dernier espace ouvert n'est gardé que dans ce navigateur. */
export function rememberSpace(slug: string) {
  try {
    localStorage.setItem(LAST_SPACE, slug)
  } catch {
    // Stockage indisponible (navigation privée) : on retombera sur le premier espace.
  }
}

/** Dernier espace ouvert encore accessible, sinon le premier. */
export function lastSpace(spaces: SpaceSummary[]) {
  let last: string | null = null
  try {
    last = localStorage.getItem(LAST_SPACE)
  } catch {
    // idem
  }
  return spaces.find((s) => s.slug === last) ?? spaces[0]
}

/** Page d'arrivée : l'analytics du dernier espace ouvert. */
export function homePath(me: Me) {
  const space = lastSpace(me.spaces)
  return space ? `/espaces/${space.slug}/analytics` : '/aucun-espace'
}

/** Paramètre `?retour=` : seulement un chemin interne au dashboard. */
export function safeReturn(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : null
}
