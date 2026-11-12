import { parisParts } from '@dashility/shared'

const integer = new Intl.NumberFormat('fr-FR')
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })
const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const parisDay = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Paris',
})
const time = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

export const formatNumber = (n: number) => integer.format(n)

/** Part de `part` dans `total`, « — » quand le total est nul. */
export const formatShare = (part: number, total: number) =>
  total ? percent.format(part / total) : '—'

/** Date `YYYY-MM-DD` → « 16 oct. ». */
export const formatDay = (date: string) => day.format(new Date(`${date}T00:00:00Z`))

/** Instant ISO → « 14:02 », heure de Paris. */
export const formatTime = (iso: string) => time.format(new Date(iso))

/** « 1 brouillon », « 2 brouillons » : le nom prend un s au-delà de un. */
export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** Instant ISO → « 7 nov. », jour de Paris (une modification à 0 h 30 compte pour ce jour-là). */
export const formatDate = (iso: string) => parisDay.format(new Date(iso))

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** Taille d'un fichier : « 820 octets », « 340 Ko », « 1,2 Mo ». */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} octets`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${decimal.format(bytes / 1024 / 1024)} Mo`
}

const parisLong = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Paris',
})
const parisClock = new Intl.DateTimeFormat('fr-FR', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

/** Instant ISO → « 17 nov. à 9:00 », à l'heure de Paris (badge « Programmé »). */
export const formatShortDateTime = (iso: string) =>
  `${formatDate(iso)} à ${parisClock.format(new Date(iso))}`

/** Instant ISO → « lundi 17 novembre à 9:00 », à l'heure de Paris. */
export const formatLongDateTime = (iso: string) =>
  `${parisLong.format(new Date(iso))} à ${parisClock.format(new Date(iso))}`

/** Date et heure de Paris d'un instant, pour des champs `date` et `time` : `2026-11-17`, `09:00`. */
export function parisInputs(date: Date) {
  const p = parisParts(date)
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

const whole = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Évolution entre deux valeurs : « +15 % », ou en points pour un taux en % (« −0,4 pt »).
 *  `null` sans base de comparaison (0 avant, en pourcentage). */
export function formatChange(now: number, before: number, unit: '%' | 'pt') {
  if (unit === '%' && !before) return null
  const diff = unit === '%' ? ((now - before) / before) * 100 : now - before
  const shown = (unit === '%' ? whole : decimal).format(Math.abs(diff))
  const sign = shown === '0' ? 0 : Math.sign(diff)
  return { sign, text: `${sign > 0 ? '+' : sign < 0 ? '−' : ''}${shown} ${unit}` }
}
