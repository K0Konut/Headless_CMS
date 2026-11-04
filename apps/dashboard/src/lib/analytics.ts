export interface Counts {
  views: number
  cvs: number
}

export interface Summary {
  totals: Counts
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
