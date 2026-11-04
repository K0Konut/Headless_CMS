import type { LocationQuery } from 'vue-router'

export type Preset = '7j' | '30j' | '6m'

export const PRESETS: { value: Preset; label: string; days: number }[] = [
  { value: '7j', label: '7 derniers jours', days: 7 },
  { value: '30j', label: '30 derniers jours', days: 30 },
  { value: '6m', label: '6 derniers mois', days: 183 },
]

export interface Period {
  preset: Preset | 'custom'
  from: string
  to: string
}

const parisDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' })
const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** Date du jour à Paris, `YYYY-MM-DD`. */
export const today = (now = new Date()) => parisDate.format(now)

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Plus ancienne date encore conservée : les événements sont gardés 6 mois. */
export const oldestDate = (now = new Date()) => addDays(today(now), -182)

/** Période décrite par l'URL : `?periode=7j|30j|6m`, ou `?du=…&au=…` ; 30 jours par défaut. */
export function periodFromQuery(query: LocationQuery, now = new Date()): Period {
  const preset = PRESETS.find((p) => p.value === query.periode)
  const { du, au } = query
  if (!preset && isDate(du) && isDate(au) && du <= au) {
    const oldest = oldestDate(now)
    const last = today(now)
    return { preset: 'custom', from: du < oldest ? oldest : du, to: au > last ? last : au }
  }
  const { value, days } = preset ?? PRESETS[1]!
  return { preset: value, from: addDays(today(now), 1 - days), to: today(now) }
}
