export interface Counts {
  views: number
  cvs: number
}

export interface Summary {
  totals: Counts
  /** Période précédente de même durée ; `null` si elle dépasse les 6 mois conservés. */
  previous: (Counts & { from: string; to: string }) | null
  daily: (Counts & { date: string })[]
  pages: (Counts & { path: string })[]
  referrers: { source: string; views: number }[]
  hasEvents: boolean
}

export interface LiveEvent {
  at: string
  kind: 'view' | 'cv'
  path: string
}
