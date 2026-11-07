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
