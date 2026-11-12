import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatChange,
  formatLongDateTime,
  formatShortDateTime,
  parisInputs,
} from './format'

describe('formatBytes', () => {
  it.each([
    [820, '820 octets'],
    [348_000, '340 Ko'],
    [1_258_291, '1,2 Mo'],
  ])('%i → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text)
  })
})

describe('dates à l’heure de Paris', () => {
  it('affiche une programmation dans l’heure de Paris, été comme hiver', () => {
    expect(formatShortDateTime('2026-11-17T08:00:00Z')).toBe('17 nov. à 9:00')
    expect(formatLongDateTime('2026-07-01T07:30:00Z')).toBe('mercredi 1 juillet à 9:30')
  })

  it('remplit les champs date et heure à l’heure de Paris', () => {
    expect(parisInputs(new Date('2026-12-31T23:30:00Z'))).toEqual({
      date: '2027-01-01',
      time: '00:30',
    })
  })
})

describe('formatChange', () => {
  it('donne l’évolution en pourcentage, arrondie à l’unité', () => {
    expect(formatChange(1163, 1012, '%')).toEqual({ sign: 1, text: '+15 %' })
    expect(formatChange(20, 30, '%')).toEqual({ sign: -1, text: '−33 %' })
    expect(formatChange(1001, 1000, '%')).toEqual({ sign: 0, text: '0 %' })
  })

  it('n’a pas de pourcentage sans valeur d’avant', () => {
    expect(formatChange(5, 0, '%')).toBeNull()
  })

  it('donne l’évolution d’un taux en points', () => {
    expect(formatChange(3.1, 2.7, 'pt')).toEqual({ sign: 1, text: '+0,4 pt' })
    expect(formatChange(2.7, 3.1, 'pt')).toEqual({ sign: -1, text: '−0,4 pt' })
  })
})
