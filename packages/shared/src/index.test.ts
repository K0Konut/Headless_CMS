import { describe, expect, it } from 'vitest'
import {
  analyticsQuerySchema,
  collectEventSchema,
  emailSchema,
  passwordSchema,
  siteUrlSchema,
  slugSchema,
} from './index'

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
    ['une clé vide', { k: '' }],
  ])('refuse %s', (_, override) => {
    expect(collectEventSchema.safeParse({ ...valid, ...override }).success).toBe(false)
  })
})

it('écarte une provenance illisible sans perdre l’événement', () => {
  expect(collectEventSchema.parse({ ...valid, r: 'https://linkedin.com/feed' })).toEqual({
    k: 'pk_test',
    t: 'view',
    p: '/projets/cms',
  })
})

describe('emailSchema', () => {
  it('normalise en minuscules sans espaces', () => {
    expect(emailSchema.parse('  Moi@Exemple.FR ')).toBe('moi@exemple.fr')
  })

  it('refuse une adresse invalide', () => {
    expect(emailSchema.safeParse('moi@').success).toBe(false)
  })
})

describe('passwordSchema', () => {
  it('exige entre 12 et 128 caractères', () => {
    expect(passwordSchema.safeParse('a'.repeat(11)).success).toBe(false)
    expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false)
  })
})

describe('slugSchema', () => {
  it.each(['portfolio', 'site-de-lea', 'a1'])('accepte %s', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(true)
  })

  it.each(['Portfolio', 'site_lea', '-a', 'a-', 'a--b', 'nouveau', ''])('refuse « %s »', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(false)
  })
})

describe('siteUrlSchema', () => {
  it('ne garde que l’origine', () => {
    expect(siteUrlSchema.parse('https://exemple.fr/projets?x=1')).toBe('https://exemple.fr')
    expect(siteUrlSchema.parse('http://localhost:5173/')).toBe('http://localhost:5173')
  })

  it('refuse un autre protocole', () => {
    expect(siteUrlSchema.safeParse('ftp://exemple.fr').success).toBe(false)
    expect(siteUrlSchema.safeParse('javascript:alert(1)').success).toBe(false)
  })
})

describe('analyticsQuerySchema', () => {
  it('accepte une période valide', () => {
    expect(analyticsQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-31' }).success).toBe(
      true,
    )
  })

  it.each([
    ['des bornes inversées', { from: '2026-10-31', to: '2026-10-01' }],
    ['une date mal formée', { from: '01/10/2026', to: '2026-10-31' }],
    ['plus de 200 jours', { from: '2026-01-01', to: '2026-12-31' }],
  ])('refuse %s', (_, query) => {
    expect(analyticsQuerySchema.safeParse(query).success).toBe(false)
  })
})
