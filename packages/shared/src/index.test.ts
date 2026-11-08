import { describe, expect, it } from 'vitest'
import {
  imageWidths,
  mediaRefs,
  richtextSchema,
  type Field,
  publicationIssues,
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
  parisDateTime,
  scheduleIssue,
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

describe('publicationIssues', () => {
  const PROJECT = {
    kind: 'collection' as const,
    fields: [
      {
        key: 'title',
        label: 'Titre',
        type: 'text',
        required: true,
        translatable: true,
        maxLength: 20,
      },
      { key: 'code', label: 'Code', type: 'link', required: false, translatable: false },
      {
        key: 'year',
        label: 'Année',
        type: 'number',
        required: false,
        translatable: false,
        decimals: false,
      },
      {
        key: 'featured',
        label: 'À la une',
        type: 'boolean',
        required: true,
        translatable: false,
        defaultValue: false,
      },
      { key: 'cover', label: 'Image', type: 'image', required: false, translatable: false },
      {
        key: 'duration',
        label: 'Durée',
        type: 'date',
        required: true,
        translatable: false,
        period: true,
        precision: 'month',
      },
      {
        key: 'steps',
        label: 'Étapes',
        type: 'group',
        required: true,
        translatable: false,
        max: 2,
        fields: [{ key: 'name', label: 'Nom', type: 'text', required: true, translatable: true }],
      },
    ] as Field[],
  }
  const VALID = {
    title: { fr: 'Ce portfolio' },
    code: 'https://github.com/moi/site',
    year: 2026,
    duration: { start: '2026-10', ongoing: true },
    steps: [{ name: { fr: 'Cadrage' } }],
  }
  const paths = (data: Record<string, unknown>, slug: string | null = 'ce-portfolio') =>
    publicationIssues(PROJECT, data, slug).map((i) => i.path)

  it('accepte une entrée complète en français, même sans anglais', () => {
    expect(paths(VALID)).toEqual([])
  })

  it('exige les champs obligatoires en français, sous-champs compris, et l’identifiant d’URL', () => {
    expect(paths({ steps: [{ name: { en: 'Scoping' } }] }, null)).toEqual([
      'slug',
      'title.fr',
      'duration',
      'steps.0.name.fr',
    ])
    expect(paths({ ...VALID, steps: [] })).toEqual(['steps'])
  })

  it('refuse les erreurs de format, en anglais aussi', () => {
    expect(
      paths({
        ...VALID,
        title: { fr: 'Ce portfolio', en: 'a'.repeat(21) },
        code: 'github.com/moi',
        year: 20.5,
        duration: { start: '2026-10', end: '2026-02' },
        steps: [VALID.steps[0], VALID.steps[0], VALID.steps[0]],
      }),
    ).toEqual(['title.en', 'code', 'year', 'duration.end', 'steps'])
    expect(paths({ ...VALID, duration: { start: '2026-13' } })).toEqual(['duration.start'])
  })

  it('ne demande pas d’identifiant d’URL à une page unique', () => {
    expect(publicationIssues({ ...PROJECT, kind: 'single' }, VALID, null)).toEqual([])
  })
})

describe('richtextSchema', () => {
  const text = (t: string, marks?: object[]) => ({ type: 'text', text: t, ...(marks && { marks }) })
  const DOC = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [text('Contexte')] },
      {
        type: 'paragraph',
        content: [
          text('Étudiant, '),
          text('important', [{ type: 'bold' }, { type: 'highlight' }]),
          text('lien', [
            {
              type: 'link',
              attrs: { href: 'https://exemple.fr', target: '_blank', rel: 'noopener' },
            },
          ]),
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 1, type: null },
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [text('Un')] },
              {
                type: 'bulletList',
                content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
              },
            ],
          },
        ],
      },
    ],
  }

  it('accepte les nœuds et marques de l’éditeur, en retirant les attributs inconnus', () => {
    const parsed = richtextSchema.parse(DOC)
    expect(JSON.stringify(parsed)).not.toContain('noopener')
    expect(JSON.stringify(parsed)).toContain('https://exemple.fr')
  })

  it.each([
    ['un intertitre h1', { type: 'heading', attrs: { level: 1 }, content: [text('Titre')] }],
    ['un bloc de code', { type: 'codeBlock', content: [text('x')] }],
    ['une marque inconnue', { type: 'paragraph', content: [text('x', [{ type: 'strike' }])] }],
    [
      'un lien javascript:',
      {
        type: 'paragraph',
        content: [text('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])],
      },
    ],
    ['du HTML brut', { type: 'paragraph', content: [{ type: 'html', html: '<script>' }] }],
  ])('refuse %s', (_, node) => {
    expect(richtextSchema.safeParse({ type: 'doc', content: [node] }).success).toBe(false)
  })

  it('accepte ce que l’éditeur produit : intertitre dans une liste, imbrication profonde, long texte', () => {
    const item = (content: object[]) => ({ type: 'listItem', content })
    let nested: object = { type: 'paragraph', content: [text('fond')] }
    for (let i = 0; i < 8; i++) nested = { type: 'bulletList', content: [item([nested])] }
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [item([{ type: 'paragraph' }, { type: 'heading', attrs: { level: 3 } }])],
        },
        nested,
        { type: 'paragraph', content: [text('a'.repeat(50_000))] },
      ],
    }
    expect(richtextSchema.safeParse(doc).success).toBe(true)
  })

  it('compte un document sans texte comme vide pour la publication', () => {
    const fields = [
      { key: 'body', label: 'Texte', type: 'richtext', required: true, translatable: true },
    ] as Field[]
    const empty = { type: 'doc', content: [{ type: 'paragraph' }] }
    const issues = (data: Record<string, unknown>) =>
      publicationIssues({ kind: 'single', fields }, data, null).map((i) => i.path)
    expect(issues({ body: { fr: empty } })).toEqual(['body.fr'])
    expect(issues({ body: { fr: DOC } })).toEqual([])
    expect(isEnComplete(fields, { body: { fr: DOC, en: empty } })).toBe(false)
  })
})

describe('médias', () => {
  const ID = '00000000-0000-4000-8000-000000000001'
  const PDF = '00000000-0000-4000-8000-000000000002'
  const fields = [
    { key: 'cover', label: 'Image', type: 'image', required: true, translatable: false },
    { key: 'cv', label: 'CV', type: 'pdf', required: true, translatable: true },
    {
      key: 'shots',
      label: 'Captures',
      type: 'group',
      required: false,
      translatable: false,
      fields: [
        { key: 'img', label: 'Capture', type: 'image', required: false, translatable: false },
      ],
    },
  ] as Field[]
  const image = (fr: string, en: string) => ({ id: ID, alt: { fr, en } })

  it('calcule les largeurs des variantes sans agrandir', () => {
    expect(imageWidths(3000)).toEqual([640, 1280, 1920])
    expect(imageWidths(1500)).toEqual([640, 1280, 1500])
    expect(imageWidths(1280)).toEqual([640, 1280])
    expect(imageWidths(400)).toEqual([400])
  })

  it('liste les médias cités, groupes et langues compris', () => {
    expect(
      mediaRefs(fields, {
        cover: image('a', 'b'),
        cv: { fr: PDF, en: null },
        shots: [{ img: image('c', '') }],
      }),
    ).toEqual([
      { id: ID, kind: 'image' },
      { id: PDF, kind: 'pdf' },
      { id: ID, kind: 'image' },
    ])
  })

  it('exige l’image, le PDF français et le texte alternatif français à la publication', () => {
    const paths = (data: Record<string, unknown>) =>
      publicationIssues({ kind: 'single', fields }, data, null).map((i) => i.path)
    expect(paths({})).toEqual(['cover', 'cv.fr'])
    expect(
      paths({ cover: image('', ''), cv: { fr: PDF }, shots: [{ img: image(' ', '') }] }),
    ).toEqual(['cover.alt.fr', 'shots.0.img.alt.fr'])
    expect(paths({ cover: image('Capture', ''), cv: { fr: PDF } })).toEqual([])
  })

  it('compte le texte alternatif anglais et le PDF anglais dans la version anglaise', () => {
    expect(isEnComplete(fields, { cover: image('a', ''), cv: { fr: PDF, en: PDF } })).toBe(false)
    expect(isEnComplete(fields, { cover: image('a', 'b'), cv: { fr: PDF } })).toBe(false)
    expect(isEnComplete(fields, { cover: image('a', 'b'), cv: { fr: PDF, en: PDF } })).toBe(true)
  })

  it('refuse une image sans identifiant valide', () => {
    expect(
      entryDataSchema(fields).safeParse({ cover: { id: 'x', alt: { fr: '', en: '' } } }).success,
    ).toBe(false)
    expect(entryDataSchema(fields).safeParse({ cv: { fr: '../etc/passwd' } }).success).toBe(false)
  })
})

describe('parisDateTime', () => {
  it.each([
    ['hiver (UTC+1)', '2026-11-17', '09:00', '2026-11-17T08:00:00.000Z'],
    ['été (UTC+2)', '2026-07-01', '09:00', '2026-07-01T07:00:00.000Z'],
    ['heure inexistante, avancée', '2026-03-29', '02:30', '2026-03-29T01:30:00.000Z'],
    ['heure en double, la seconde', '2026-10-25', '02:30', '2026-10-25T01:30:00.000Z'],
    ['minuit', '2026-12-31', '00:00', '2026-12-30T23:00:00.000Z'],
  ])('%s', (_, date, time, iso) => {
    expect(parisDateTime(date, time).toISOString()).toBe(iso)
  })
})

it('borne une publication programmée entre une minute et un an', () => {
  const now = Date.parse('2026-11-08T12:00:00Z')
  const at = (ms: number) => scheduleIssue(new Date(now + ms), now)
  expect(at(30_000)).toMatch(/à venir/)
  expect(at(120_000)).toBeNull()
  expect(at(367 * 86_400_000)).toMatch(/année/)
  expect(scheduleIssue(new Date('x'), now)).toMatch(/date et une heure/)
})
