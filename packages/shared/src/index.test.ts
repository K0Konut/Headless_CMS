import { describe, expect, it } from 'vitest'
import {
  analyticsQuerySchema,
  collectEventSchema,
  createContentTypeSchema,
  emailSchema,
  entryDataSchema,
  entryTitle,
  fieldSchema,
  entryPruner,
  entryStatus,
  frozenFieldChange,
  isEnComplete,
  isValidLink,
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

describe('types de contenu', () => {
  const title = { key: 'title', label: 'Titre', type: 'text', required: true, translatable: true }
  const projects = {
    slug: 'projets',
    kind: 'collection',
    name: 'Projets',
    entryLabel: 'un projet',
    fields: [title],
  }

  it('accepte une collection et une page unique', () => {
    expect(createContentTypeSchema.safeParse(projects).success).toBe(true)
    const page = { ...projects, slug: 'cv', kind: 'single', entryLabel: null, fields: [] }
    expect(createContentTypeSchema.safeParse(page).success).toBe(true)
  })

  it.each([
    ['une collection sans nom d’entrée', { entryLabel: null }],
    ['une page unique avec un nom d’entrée', { kind: 'single' }],
    ['deux champs avec le même identifiant', { fields: [title, { ...title, label: 'Autre' }] }],
    ['un identifiant de champ invalide', { fields: [{ ...title, key: 'Titre du projet' }] }],
    [
      'un choix traduisible',
      {
        fields: [
          { ...title, type: 'choice', choices: [{ key: 'perso', fr: 'Perso', en: 'Personal' }] },
        ],
      },
    ],
    [
      'une liste de choix vide',
      { fields: [{ ...title, type: 'choice', translatable: false, choices: [] }] },
    ],
    [
      'un groupe dans un groupe',
      {
        fields: [
          {
            ...title,
            type: 'group',
            translatable: false,
            fields: [{ ...title, type: 'group', translatable: false, fields: [title] }],
          },
        ],
      },
    ],
    [
      'un groupe dont le minimum dépasse le maximum',
      {
        fields: [{ ...title, type: 'group', translatable: false, fields: [title], min: 3, max: 2 }],
      },
    ],
  ])('refuse %s', (_, override) => {
    expect(createContentTypeSchema.safeParse({ ...projects, ...override }).success).toBe(false)
  })

  it('repère un changement figé, y compris dans un groupe', () => {
    const group = {
      ...title,
      key: 'steps',
      type: 'group',
      translatable: false,
      fields: [title],
    } as const
    const fields = (list: object[]) => fieldSchema.array().parse(list)
    const before = fields([title, group])
    const after = (list: object[]) => frozenFieldChange(before, fields(list))
    expect(after([{ ...title, label: 'Nom' }])).toBeNull()
    expect(after([{ ...title, type: 'richtext' }])).toMatch(/type du champ « title »/)
    expect(after([{ ...title, translatable: false }])).toMatch(/non traduisible/)
    expect(after([{ ...group, fields: [{ ...title, translatable: false }] }])).toMatch(/« title »/)
  })
})

describe('valeurs des entrées', () => {
  const fields = fieldSchema.array().parse([
    { key: 'title', label: 'Titre', type: 'text', required: true, translatable: true },
    {
      key: 'kind',
      label: 'Type',
      type: 'choice',
      required: true,
      translatable: false,
      choices: [{ key: 'perso', fr: 'Perso', en: 'Personal' }],
    },
    {
      key: 'period',
      label: 'Durée',
      type: 'date',
      required: false,
      translatable: false,
      period: true,
      precision: 'month',
    },
    { key: 'stack', label: 'Stack', type: 'list', required: false, translatable: false },
    {
      key: 'steps',
      label: 'Étapes',
      type: 'group',
      required: false,
      translatable: false,
      fields: [{ key: 'name', label: 'Nom', type: 'text', required: true, translatable: true }],
    },
    { key: 'body', label: 'Corps', type: 'richtext', required: false, translatable: true },
  ])
  const data = {
    title: { fr: 'Ce portfolio', en: 'This portfolio' },
    kind: 'perso',
    period: { start: '2026-10', ongoing: true },
    stack: ['Vue', 'Vite'],
    steps: [{ name: { fr: 'PRD', en: 'PRD' } }],
  }

  it('accepte un brouillon complet ou vide', () => {
    expect(entryDataSchema(fields).safeParse(data).success).toBe(true)
    expect(entryDataSchema(fields).safeParse({}).success).toBe(true)
  })

  it.each([
    ['une clé inconnue', { other: 'x' }],
    ['un choix inconnu', { kind: 'client' }],
    ['une date mal formée', { period: { start: 'octobre' } }],
    ['une valeur traduite pour un champ non traduisible', { kind: { fr: 'perso' } }],
    ['un champ de l’étape suivante rempli', { body: { fr: 'texte' } }],
    ['un sous-champ inconnu', { steps: [{ other: 'x' }] }],
  ])('refuse %s', (_, value) => {
    expect(entryDataSchema(fields).safeParse(value).success).toBe(false)
  })

  it('repère une version anglaise incomplète, y compris dans un groupe', () => {
    expect(isEnComplete(fields, data)).toBe(true)
    expect(isEnComplete(fields, { ...data, title: { fr: 'Titre', en: '  ' } })).toBe(false)
    expect(isEnComplete(fields, { ...data, steps: [{ name: { fr: 'PRD' } }] })).toBe(false)
  })

  it('retire les valeurs devenues invalides après un changement de structure', () => {
    const kept = fields.filter((f) => f.key !== 'stack')
    const choice = kept[1]!
    if (choice.type === 'choice') choice.choices = [{ key: 'ecole', fr: 'École', en: 'School' }]
    expect(entryPruner(kept)(data)).toEqual({
      title: data.title,
      period: data.period,
      steps: data.steps,
    })
  })

  it('prend le titre français du premier texte court', () => {
    expect(entryTitle(fields, data)).toBe('Ce portfolio')
    expect(entryTitle(fields, {})).toBe('')
  })
})

it('déduit le statut des deux versions', () => {
  expect(entryStatus({ published: null, draft: {} })).toBe('draft')
  expect(entryStatus({ published: {}, draft: null })).toBe('published')
  expect(entryStatus({ published: {}, draft: {} })).toBe('modified')
})

describe('isValidLink', () => {
  it.each([
    ['https://github.com/K0Konut', true],
    ['mailto:moi@exemple.fr', true],
    ['github.com/K0Konut', false],
    ['javascript:alert(1)', false],
  ])('%s → %s', (value, valid) => {
    expect(isValidLink(value)).toBe(valid)
  })
})
