import { PREVIEW_PARAM } from '@dashility/shared'

/** Réponse de `GET /spaces/:slug` ; la clé publique et la date de la clé API ne sont renvoyées
 *  qu'au super-admin. */
export interface SpaceDetail {
  slug: string
  name: string
  siteUrl: string
  previewUrl: string | null
  createdAt: string
  publicKey?: string
  /** null : aucune clé API générée. */
  apiKeyCreatedAt?: string | null
}

export interface Members {
  members: { id: string; email: string; joinedAt: string }[]
  invitations: { id: string; email: string; expiresAt: string }[]
}

/** Lien à transmettre à la main (pas d'email en V1). */
export const linkUrl = (kind: 'invitation' | 'reinitialisation', token: string) =>
  `${location.origin}/${kind}/${token}`

/** Adresse de la page d'aperçu avec un jeton : `essai` pour « Tester », un vrai jeton sinon. */
export function previewLink(previewUrl: string, token: string) {
  const url = new URL(previewUrl)
  url.searchParams.set(PREVIEW_PARAM, token)
  return url.href
}
