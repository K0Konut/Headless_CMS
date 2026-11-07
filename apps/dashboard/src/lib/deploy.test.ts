import { describe, expect, it } from 'vitest'
import { deployLabel } from './deploy'

// 7 novembre 2026, 15 h à Paris.
const NOW = new Date('2026-11-07T14:00:00Z')
const state = { configured: true, pending: false, last: null }

describe('deployLabel', () => {
  it.each([
    [{ ...state, configured: false }, 'Aucun déploiement configuré'],
    [{ ...state, pending: true }, 'Déploiement demandé…'],
    [state, 'Aucun déploiement demandé pour l’instant'],
    [
      { ...state, last: { at: '2026-11-07T13:02:00Z', status: 204, ok: true } },
      'Déploiement demandé à 14:02 · réussi',
    ],
    [
      { ...state, last: { at: '2026-11-06T13:02:00Z', status: 204, ok: true } },
      'Déploiement demandé le 6 nov. à 14:02 · réussi',
    ],
    [
      { ...state, last: { at: '2026-11-07T13:02:00Z', status: 500, ok: false } },
      'Le déploiement a échoué (le site a répondu 500)',
    ],
    [
      { ...state, last: { at: '2026-11-07T13:02:00Z', status: null, ok: false } },
      'Le déploiement a échoué (le site est injoignable)',
    ],
  ])('%j', (value, label) => {
    expect(deployLabel(value, NOW)).toBe(label)
  })
})
