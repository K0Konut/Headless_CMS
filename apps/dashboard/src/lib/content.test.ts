import { describe, expect, it } from 'vitest'
import { fieldKey, removedFields } from './content'

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

describe('removedFields', () => {
  const text = {
    key: 'title',
    label: 'Titre',
    type: 'text',
    required: false,
    translatable: false,
  } as const
  const choice = {
    key: 'kind',
    label: 'Type',
    type: 'choice',
    required: false,
    translatable: false,
    choices: [
      { key: 'perso', fr: 'Perso', en: 'Personal' },
      { key: 'ecole', fr: 'École', en: 'School' },
    ],
  } as const
  const group = {
    key: 'steps',
    label: 'Étapes',
    type: 'group',
    required: false,
    translatable: false,
  } as const

  it('liste les champs, choix et sous-champs retirés', () => {
    const before = [
      { ...text },
      { ...choice, choices: [...choice.choices] },
      { ...group, fields: [{ ...text }] },
    ]
    const after = [
      { ...choice, choices: [choice.choices[0]] },
      { ...group, fields: [] },
    ]
    expect(removedFields(before, after)).toEqual(['Titre', 'Type : École', 'Étapes : Titre'])
    expect(removedFields(before, before)).toEqual([])
  })
})
