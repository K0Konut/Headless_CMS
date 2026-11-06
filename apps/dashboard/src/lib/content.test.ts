import { describe, expect, it } from 'vitest'
import { fieldKey } from './content'

describe('fieldKey', () => {
  it.each([
    ['Lien vers le code', 'lien_vers_le_code'],
    ['Équipe', 'equipe'],
    ['2 images', 'champ_2_images'],
    ['', ''],
    [`2 ${'a'.repeat(60)}`, `champ_2_${'a'.repeat(42)}`],
  ])('« %s » → « %s »', (label, key) => {
    expect(fieldKey(label)).toBe(key)
  })
})
