export interface SpaceSummary {
  slug: string
  name: string
  siteUrl: string
  /** Page d'aperçu du site (V3) ; null : pas de prévisualisation. */
  previewUrl: string | null
}

/** Réponse de `/auth/me`, de la connexion et de la consommation d'un lien. */
export interface Me {
  user: { id: string; email: string; isSuperAdmin: boolean }
  spaces: SpaceSummary[]
}
