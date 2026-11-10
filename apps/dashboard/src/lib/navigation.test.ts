import { beforeEach, describe, expect, it } from 'vitest'
import { homePath, rememberSpace, safeReturn } from './navigation'
import type { Me } from './types'

const me = (slugs: string[]): Me => ({
  user: { id: 'u', email: 'a@b.fr', isSuperAdmin: false },
  spaces: slugs.map((slug) => ({ slug, name: slug, siteUrl: `https://${slug}.fr` })),
})

beforeEach(() => localStorage.clear())

describe('homePath', () => {
  it('ouvre le dernier espace consulté s’il est encore accessible', () => {
    rememberSpace('blog')
    expect(homePath(me(['portfolio', 'blog']))).toBe('/espaces/blog/analytics')
  })

  it('retombe sur le premier espace sinon', () => {
    rememberSpace('retire')
    expect(homePath(me(['portfolio', 'blog']))).toBe('/espaces/portfolio/analytics')
  })

  it('mène à « Aucun espace » sans espace', () => {
    expect(homePath(me([]))).toBe('/aucun-espace')
  })
})

describe('safeReturn', () => {
  it('accepte un chemin interne', () => {
    expect(safeReturn('/espaces/blog/analytics?x=1')).toBe('/espaces/blog/analytics?x=1')
  })

  it.each(['//pirate.fr', 'https://pirate.fr', 'espaces', undefined, ['/a']])(
    'refuse %s',
    (value) => {
      expect(safeReturn(value)).toBeNull()
    },
  )
})
