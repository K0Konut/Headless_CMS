import { addDays, oldestDate, parisToday as today } from '@dashility/shared'
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

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

export { addDays, oldestDate, parisToday as today } from '@dashility/shared'

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
