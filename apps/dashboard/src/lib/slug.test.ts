import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it.each([
    ['Site de Léa', 'site-de-lea'],
    ['  Portfolio — 2026 !', 'portfolio-2026'],
    ['Œuvres & Ça', 'uvres-ca'],
    ['a'.repeat(49) + ' b', 'a'.repeat(49)],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug)
  })
})
