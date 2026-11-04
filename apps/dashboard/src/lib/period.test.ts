import { describe, expect, it } from 'vitest'
import { periodFromQuery } from './period'

// 4 novembre 2026, 0 h 30 à Paris (23 h 30 UTC la veille).
const NOW = new Date('2026-11-03T23:30:00Z')

describe('periodFromQuery', () => {
  it('prend les 30 derniers jours par défaut, en date de Paris', () => {
    expect(periodFromQuery({}, NOW)).toEqual({
      preset: '30j',
      from: '2026-10-06',
      to: '2026-11-04',
    })
  })

  it('lit un préréglage', () => {
    expect(periodFromQuery({ periode: '7j' }, NOW)).toMatchObject({ from: '2026-10-29' })
  })

  it('borne une période personnalisée à la rétention et à aujourd’hui', () => {
    expect(periodFromQuery({ du: '2025-01-01', au: '2030-01-01' }, NOW)).toEqual({
      preset: 'custom',
      from: '2026-05-06',
      to: '2026-11-04',
    })
  })

  it('ignore une période personnalisée invalide', () => {
    expect(periodFromQuery({ du: '2026-11-02', au: '2026-11-01' }, NOW).preset).toBe('30j')
  })
})
