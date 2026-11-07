import type { DeployState } from '@dashility/shared'
import { formatDate, formatTime } from './format'

/** Moment d'un appel : « à 14:02 » aujourd'hui, « le 6 nov. à 14:02 » avant. */
export function callTime(iso: string, now = new Date()) {
  const sameDay = formatDate(iso) === formatDate(now.toISOString())
  return sameDay ? `à ${formatTime(iso)}` : `le ${formatDate(iso)} à ${formatTime(iso)}`
}

/** État du déploiement, tel que l'éditeur et les réglages l'affichent (document UX,
 *  « Déploiement ») : c'est l'état de l'appel, pas celui du site. */
export function deployLabel(state: DeployState, now = new Date()) {
  if (!state.configured) return 'Aucun déploiement configuré'
  if (state.pending) return 'Déploiement demandé…'
  if (!state.last) return 'Aucun déploiement demandé pour l’instant'
  if (state.last.ok) return `Déploiement demandé ${callTime(state.last.at, now)} · réussi`
  return state.last.status === null
    ? 'Le déploiement a échoué (le site est injoignable)'
    : `Le déploiement a échoué (le site a répondu ${state.last.status})`
}
