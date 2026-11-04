import { describe, expect, it } from 'vitest'
import { collectEventSchema } from './index'

const valid = { k: 'pk_test', t: 'view', p: '/projets/cms', r: 'linkedin.com' }

describe('collectEventSchema', () => {
  it('accepte un événement valide, avec ou sans provenance', () => {
    expect(collectEventSchema.safeParse(valid).success).toBe(true)
    expect(collectEventSchema.safeParse({ ...valid, r: undefined }).success).toBe(true)
  })

  it.each([
    ['un type inconnu', { t: 'click' }],
    ['un chemin trop long', { p: '/' + 'a'.repeat(512) }],
    ['un chemin relatif', { p: 'projets' }],
    ['une provenance qui est une URL', { r: 'https://linkedin.com/feed' }],
    ['une clé vide', { k: '' }],
  ])('refuse %s', (_, override) => {
    expect(collectEventSchema.safeParse({ ...valid, ...override }).success).toBe(false)
  })
})
