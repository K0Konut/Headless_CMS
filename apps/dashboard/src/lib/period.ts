import type { LocationQuery } from 'vue-router'

export type Preset = '7j' | '30j' | '6m'

/** `days` absent : depuis la plus ancienne date conservée. */
export const PRESETS: { value: Preset; label: string; days?: number }[] = [
  { value: '7j', label: '7 derniers jours', days: 7 },
  { value: '30j', label: '30 derniers jours', days: 30 },
  { value: '6m', label: '6 derniers mois' },
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

/** Plus ancienne date entière encore conservée : l'API supprime les événements de plus de
 *  6 mois (en mois calendaires), le jour limite est donc exclu. */
export function oldestDate(now = new Date()) {
  const d = new Date(`${today(now)}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - 6)
  return addDays(d.toISOString().slice(0, 10), 1)
}

/** Période décrite par l'URL : `?periode=7j|30j|6m`, ou `?du=…&au=…` ; 30 jours par défaut. */
export function periodFromQuery(query: LocationQuery, now = new Date()): Period {
  const preset = PRESETS.find((p) => p.value === query.periode)
  const { du, au } = query
  if (!preset && isDate(du) && isDate(au)) {
    const oldest = oldestDate(now)
    const last = today(now)
    const from = du < oldest ? oldest : du
    const to = au > last ? last : au
    // Période entièrement hors de la rétention ou dans le futur : période par défaut.
    if (from <= to) return { preset: 'custom', from, to }
  }
  const { value, days } = preset ?? PRESETS[1]!
  return {
    preset: value,
    from: days ? addDays(today(now), 1 - days) : oldestDate(now),
    to: today(now),
  }
}
