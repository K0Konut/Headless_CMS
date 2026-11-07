/** Réponse de `GET /spaces/:slug` ; la clé publique et la date de la clé API ne sont renvoyées
 *  qu'au super-admin. */
export interface SpaceDetail {
  slug: string
  name: string
  siteUrl: string
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
