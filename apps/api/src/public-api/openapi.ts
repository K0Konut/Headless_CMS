import type { OpenAPIObject } from '@nestjs/swagger'

/** Paramètre d'une opération, tel que le type `OpenAPIObject` l'attend. */
type ParameterObject = Extract<
  NonNullable<NonNullable<OpenAPIObject['paths'][string]['get']>['parameters']>[number],
  { in: unknown }
>

const locale: ParameterObject = {
  name: 'locale',
  in: 'query',
  description:
    'Langue des valeurs. En anglais, seules les entrées dont la version anglaise est complète sont renvoyées.',
  schema: { type: 'string', enum: ['fr', 'en'], default: 'fr' },
}
const typeParam: ParameterObject = {
  name: 'type',
  in: 'path',
  required: true,
  description: 'Identifiant du type de contenu (Structure), par exemple `projets`.',
  schema: { type: 'string' },
}
const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
})

/** Documentation de l'API de lecture des sites (`/api/v1`), servie sur `/api/docs`. Écrite à la
 *  main : les valeurs dépendent des champs de chaque type, définis dans Structure. L'API du
 *  dashboard n'y figure pas, elle n'est pas faite pour d'autres clients. */
export const openApiDocument: OpenAPIObject = {
  openapi: '3.1.0',
  info: {
    title: 'Dashility — API de lecture',
    version: '1',
    description: [
      'Lecture du contenu **publié** d’un espace, pour le build ou le serveur d’un site. Les brouillons et les modifications non publiées ne sont jamais renvoyés.',
      '',
      'La clé se génère dans **Réglages › Intégration** (super-admin). Elle désigne l’espace : il n’apparaît pas dans l’adresse. Elle ne doit jamais être exposée dans un navigateur (pas de CORS). 120 requêtes par minute et par clé.',
      '',
      '**Valeurs, selon le type de champ** : texte court et lien → chaîne ou `null` ; texte riche → `{ html }` (seulement `p`, `h2`, `h3`, `ul`, `ol`, `li`, `strong`, `em`, `a`, `mark`, texte échappé) ; liste de choix → `{ key, label }` ; date → `{ start, end?, ongoing? }` en `AAAA-MM` ou `AAAA-MM-JJ` ; liste de valeurs → tableau ; nombre ; oui / non → booléen (valeur par défaut si jamais touché) ; image → `{ alt, width, height, src, srcset: { webp, avif } }` ; PDF → `{ url, bytes }` ; groupe → tableau d’objets construits de la même façon. Une valeur vide vaut `null`.',
    ].join('\n'),
  },
  servers: [{ url: '/api/v1' }],
  security: [{ cle: [] }],
  paths: {
    '/content/{type}': {
      get: {
        summary: 'Contenu d’un type',
        description:
          'Collection : tableau de ses entrées publiées, la dernière publiée d’abord (l’ordre d’affichage est décidé par le site). Page unique : son entrée.',
        parameters: [typeParam, locale],
        responses: {
          200: {
            description: 'Entrées publiées (collection) ou entrée (page unique)',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { type: 'array', items: { $ref: '#/components/schemas/Entry' } },
                    { $ref: '#/components/schemas/Entry' },
                  ],
                },
              },
            },
          },
          401: error('Clé absente, mal formée ou régénérée depuis'),
          404: error('Type inconnu, ou page unique pas encore publiée'),
          429: error('Plus de 120 requêtes dans la minute (en-tête `Retry-After`)'),
        },
      },
    },
    '/content/{type}/{slug}': {
      get: {
        summary: 'Une entrée d’une collection',
        parameters: [
          typeParam,
          {
            name: 'slug',
            in: 'path' as const,
            required: true,
            description: 'Identifiant d’URL de l’entrée, par exemple `ce-portfolio`.',
            schema: { type: 'string' },
          },
          locale,
        ],
        responses: {
          200: {
            description: 'L’entrée publiée',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Entry' } } },
          },
          401: error('Clé absente, mal formée ou régénérée depuis'),
          404: error('Entrée inconnue, non publiée, ou incomplète en anglais avec `locale=en`'),
          429: error('Plus de 120 requêtes dans la minute (en-tête `Retry-After`)'),
        },
      },
    },
    '/preview/{token}': {
      servers: [{ url: '/api' }],
      get: {
        summary: 'Aperçu d’une entrée (page d’aperçu du site)',
        description:
          'Lu **depuis le navigateur** par la page d’aperçu du site, qui reçoit le jeton dans le paramètre `dashility-preview`. Sans clé : le jeton donne accès à une seule entrée, en lecture, pendant 24 h. CORS ouvert, sans cookie. Renvoie la **version en cours** (brouillon ou modifications non publiées), avec les valeurs au même format que `/content`. En anglais, l’entrée est renvoyée même incomplète (`enComplete: false`, valeurs manquantes à `null`). 60 requêtes par minute et par IP.',
        security: [],
        parameters: [
          {
            name: 'token',
            in: 'path' as const,
            required: true,
            description: 'Valeur du paramètre `dashility-preview` de la page d’aperçu.',
            schema: { type: 'string' },
          },
          { ...locale, description: 'Langue des valeurs.' },
        ],
        responses: {
          200: {
            description: 'L’entrée, version en cours',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Preview' } } },
          },
          404: error(
            '`preview_not_found` : lien inconnu ; `preview_entry_deleted` : l’entrée a été supprimée',
          ),
          410: error('`preview_expired` : le lien a plus de 24 h'),
          429: error('Plus de 60 requêtes dans la minute'),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      cle: {
        type: 'http',
        scheme: 'bearer',
        description: 'Clé API de l’espace : `Authorization: Bearer dly_…`',
      },
    },
    schemas: {
      Entry: {
        type: 'object',
        required: ['publishedAt', 'fields'],
        properties: {
          slug: { type: 'string', description: 'Identifiant d’URL (collections seulement)' },
          publishedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Date de la dernière publication',
          },
          fields: {
            type: 'object',
            description: 'Valeurs, indexées par l’identifiant des champs du type',
            additionalProperties: true,
          },
        },
      },
      Preview: {
        type: 'object',
        required: ['type', 'kind', 'fields', 'status', 'enComplete', 'expiresAt'],
        properties: {
          type: { type: 'string', description: 'Identifiant du type : le site choisit sa page' },
          kind: { type: 'string', enum: ['collection', 'single'] },
          slug: { type: 'string', description: 'Identifiant d’URL en cours (collections)' },
          publishedAt: {
            type: ['string', 'null'],
            format: 'date-time',
            description: 'Dernière publication ; `null` pour un brouillon jamais publié',
          },
          fields: { type: 'object', additionalProperties: true },
          status: { type: 'string', enum: ['draft', 'modified', 'published'] },
          enComplete: { type: 'boolean' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
  },
}
