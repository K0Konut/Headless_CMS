import { describe, expect, it } from 'vitest'
import { fieldKey } from './content'

describe('fieldKey', () => {
  it.each([
    ['Lien vers le code', 'lien_vers_le_code'],
    ['Équipe', 'equipe'],
    ['2 images', 'champ_2_images'],
    ['', ''],
  ])('« %s » → « %s »', (label, key) => {
    expect(fieldKey(label)).toBe(key)
  })
})
