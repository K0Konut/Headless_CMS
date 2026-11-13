# Architecture technique

4 novembre 2026, complété le 6 novembre 2026 pour la V2, puis du 8 au 12 novembre 2026 pour la V3 · s'appuie sur `01-PRD.md`, `04-architecture-contenu-ux.md` et `decisions.md`

Ce document fixe comment la V1 (analytics) est construite, puis la V2 (contenu) dans la section « V2 : contenu », la publication programmée de la V3 dans « V3 : publication programmée » sa prévisualisation dans « V3 : prévisualisation » et la mise en avant dans « V3 : mise en avant ».

## Vue d'ensemble

```mermaid
flowchart LR
    subgraph Serveur["Serveur Proxmox · Docker Compose"]
        NPM["Nginx Proxy Manager<br/>HTTPS"] --> APP["app · Node 22<br/>NestJS : /api<br/>+ dashboard statique : /"]
        APP --> DB[("db · PostgreSQL 17")]
        BK["backup · pg_dump quotidien"] --> DB
        BK --> NAS[("NAS")]
    end
    U["Toi, membres"] -- "dashility.costamask.dev/" --> NPM
    SITE["Portfolio<br/>@dashility/client"] -- "POST /api/e<br/>(vues, CV)" --> NPM
```

- **Un seul conteneur applicatif.** NestJS sert l'API sous `/api` et les fichiers compilés du dashboard sous `/`. Le dashboard et l'API sont sur la même origine, il n'y a donc pas de CORS pour le dashboard et le cookie de session reste en `SameSite=Strict`.
- **Ce qui est ouvert aux autres origines** : seul l'endpoint de collecte `/api/e` accepte les requêtes des sites, et seulement depuis l'URL déclarée de leur espace.
- **Pas de Redis ni de file d'attente.** Avec une seule instance et le trafic d'un portfolio, PostgreSQL et la mémoire du processus suffisent.

## Stack

| Brique | Choix |
| --- | --- |
| Langage | TypeScript strict partout, Node 22 LTS |
| Monorepo | npm workspaces |
| API | NestJS, `@nestjs/swagger` (OpenAPI sur `/api/docs`), `@nestjs/throttler`, `@nestjs/schedule` |
| Base | PostgreSQL 17, Drizzle ORM et drizzle-kit pour les migrations |
| Validation | Zod, schémas dans `packages/shared`, utilisés par l'API, le dashboard et le client |
| Mots de passe | Argon2id (paquet `argon2`) |
| Dashboard | Vue 3, Vite, Vue Router, Pinia, shadcn-vue, Tailwind CSS, graphiques shadcn-vue (Unovis) |
| Texte riche (V2) | Tiptap (`@tiptap/vue-3`) dans le dashboard, `@tiptap/html` dans l'API pour produire le HTML servi aux sites |
| Images (V2) | `sharp` : vérification du type réel, variantes WebP et AVIF |
| Script de collecte | TypeScript sans dépendance, compilé par Vite en mode librairie |
| Tests | Vitest partout (l'API passe par SWC pour les décorateurs), Playwright pour le dashboard, PostgreSQL réel en CI pour les tests d'intégration |
| Qualité | ESLint, Prettier, `vue-tsc` et `tsc --noEmit` |
| Conteneurs | Image Docker multi-étapes, Docker Compose |

**Convention de nommage** : le code, la base et les routes de l'API sont en anglais, ce qui est l'usage courant pour un dépôt public. Les URLs du dashboard, l'interface et les commits sont en français.

## Organisation du monorepo

```
.
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── cli.ts               # commandes serveur (création du super-admin)
│   │   │   ├── db/                  # schéma Drizzle, connexion
│   │   │   ├── auth/                # login, sessions, guards
│   │   │   ├── spaces/              # espaces, membres, invitations
│   │   │   ├── analytics/           # lecture, export CSV, SSE
│   │   │   ├── collect/             # endpoint public /api/e
│   │   │   ├── content/             # V2 : types, entrées, publication
│   │   │   ├── media/               # V2 : envoi et service des images et des PDF
│   │   │   ├── public-api/          # V2 : API de lecture des sites (/api/v1)
│   │   │   └── deploy/              # V2 : appel de l'URL de déploiement
│   │   ├── drizzle/                 # migrations SQL générées
│   │   └── test/                    # tests d'intégration
│   └── dashboard/
│       └── src/
│           ├── pages/               # un fichier par écran du document UX
│           ├── components/          # composants shadcn-vue + composants maison
│           ├── composables/         # useApi, useSession, useLiveEvents…
│           ├── stores/              # Pinia : session
│           └── router.ts
├── packages/
│   ├── shared/                      # schémas Zod et types partagés
│   └── client/                      # package npm des sites (V1 : script analytics)
├── docker/
│   ├── Dockerfile
│   └── compose.yml
└── .github/workflows/ci.yml
```

## Modèle de données (V1)

```mermaid
erDiagram
    users ||--o{ sessions : ouvre
    users ||--o{ memberships : appartient
    spaces ||--o{ memberships : regroupe
    spaces ||--o{ tokens : "invitations"
    users ||--o{ tokens : "réinitialisations"
    spaces ||--o{ events : collecte
    users {
        uuid id PK
        text email UK "en minuscules"
        text password_hash
        bool is_super_admin
        timestamptz created_at
    }
    sessions {
        text id PK "sha256 du jeton"
        uuid user_id FK
        timestamptz expires_at
    }
    spaces {
        uuid id PK
        text slug UK
        text name
        text site_url "origine autorisée pour la collecte"
        text public_key UK "identifiant public pour le script"
        timestamptz created_at
    }
    memberships {
        uuid user_id PK
        uuid space_id PK
        timestamptz created_at
    }
    tokens {
        text id PK "sha256 du jeton"
        text kind "invitation ou reset"
        text email
        uuid space_id FK "invitation"
        uuid user_id FK "reset"
        timestamptz expires_at
        timestamptz used_at
    }
    events {
        bigint id PK
        uuid space_id FK
        text kind "view ou cv"
        text path
        text referrer "domaine ou vide"
        timestamptz created_at
    }
```

- **Accès du super-admin** : il voit tous les espaces sans ligne dans `memberships`.
- **Index de `events`** : `(space_id, created_at)` couvre toutes les requêtes de l'onglet analytics.
- **Jetons et sessions** : on ne stocke que leur empreinte SHA-256. Une fuite de la base ne donne donc aucun jeton utilisable.
- **Dernier espace ouvert** : il est gardé dans le `localStorage` du dashboard, pas en base. Ce n'est qu'une commodité.
- **Suppression d'un espace** : en cascade sur ses `memberships`, `tokens` et `events`.

Le modèle de données de la V2 est décrit dans la section « V2 : contenu ».

## API (V1)

Toutes les routes sont préfixées par `/api`. Le corps des requêtes et les réponses sont en JSON, validés par Zod.

| Méthode et route | Accès | Rôle |
| --- | --- | --- |
| `POST /auth/login` | Public, limité en débit | Ouvre une session et pose le cookie |
| `POST /auth/logout` | Connecté | Supprime la session |
| `GET /auth/me` | Connecté | Utilisateur et liste de ses espaces |
| `PUT /auth/password` | Connecté | Change le mot de passe et ferme les autres sessions |
| `GET /tokens/:token` | Public | Vérifie un lien d'invitation ou de réinitialisation et renvoie son type et l'email |
| `POST /tokens/:token` | Public | Consomme le lien : `{ password }`, crée le compte ou change le mot de passe, ouvre une session |
| `GET /spaces` | Connecté | Espaces accessibles |
| `POST /spaces` | Super-admin | Crée un espace |
| `GET /spaces/:slug` | Membre | Détail d'un espace (la clé publique n'est renvoyée qu'au super-admin) |
| `PATCH /spaces/:slug` | Super-admin | Nom, slug, URL du site |
| `DELETE /spaces/:slug` | Super-admin | Supprime l'espace |
| `GET /spaces/:slug/members` | Super-admin | Membres et invitations en attente |
| `POST /spaces/:slug/invitations` | Super-admin | `{ email }` : renvoie le lien, ou ajoute directement un compte existant |
| `DELETE /spaces/:slug/invitations/:id` | Super-admin | Annule une invitation (en régénérer une = annuler puis recréer) |
| `DELETE /spaces/:slug/members/:userId` | Super-admin | Retire un membre |
| `POST /users/:id/password-reset` | Super-admin | Renvoie un lien de réinitialisation |
| `GET /spaces/:slug/analytics?from&to` | Membre | Totaux, série par jour, pages, provenances ; `previous` : `{ from, to, views, cvs }` de la période précédente de même durée, `null` si elle commence avant les 6 mois conservés |
| `GET /spaces/:slug/analytics/export.csv?from&to` | Membre | Événements bruts de la période |
| `GET /spaces/:slug/analytics/live` | Membre | Flux SSE des nouveaux événements |
| `POST /e` | Public, CORS limité à `site_url` | Collecte d'un événement |
| `GET /health` | Public | Santé de l'API et de la base |

**Règles communes**

- Un espace auquel l'utilisateur n'a pas accès renvoie **404**, jamais 403 (document UX). C'est un seul guard, `SpaceAccessGuard`, qui charge l'espace par son slug et vérifie l'appartenance.
- Les erreurs suivent un format unique : `{ error: { code, message } }`.
- Les dates sont en ISO 8601 UTC. Les agrégations par jour se font dans le fuseau `Europe/Paris`.

## Authentification et sécurité

- **Sessions** : jeton aléatoire de 32 octets dans le cookie `dashility_session` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`). En base, on ne garde que son empreinte. La session dure 14 jours et se prolonge à chaque usage.
- **Révocation** : changer ou réinitialiser un mot de passe supprime toutes les sessions du compte. Retirer un membre prend effet à la requête suivante, puisque l'appartenance est vérifiée à chaque requête.
- **CSRF** : on s'appuie sur `SameSite=Strict`, la même origine pour le dashboard et l'API, et le refus des requêtes qui modifient des données sans `Content-Type: application/json`.
- **Limitation du débit** : `/auth/login` accepte 5 tentatives par minute par IP et par email, et `/e` 60 événements par minute par IP. Les IP ne restent qu'en mémoire, jamais en base.
- **Liens à usage unique** : jeton de 32 octets, valable 72 h pour une invitation et 24 h pour une réinitialisation, et marqué `used_at` dès qu'il est consommé.
- **En-têtes** : Helmet, avec une CSP stricte sur le dashboard. Seule exception : `img-src` accepte les images https, pour le favicon des sites dans le sélecteur d'espace.
- **Premier super-admin** : il est créé par une commande serveur (`docker compose exec app node dist/cli.js create-super-admin <email>`), qui demande le mot de passe dans le terminal. Aucun secret ne passe par les variables d'environnement.

## Collecte analytics

### Script (`packages/client`)

```ts
import { initAnalytics } from '@dashility/client'
initAnalytics({ key: '<clé publique de l\'espace>', endpoint: 'https://dashility.costamask.dev/api/e' })
```

- **Vues** : une vue au chargement de la page, puis une à chaque navigation SPA (interception de `history.pushState` et de `popstate`), car vite-ssg hydrate le site en application Vue.
- **CV** : un clic sur un lien portant l'attribut `data-dashility-cv` envoie un événement `cv`. Le script l'écoute par délégation sur `document`.
- **Envoi** : `navigator.sendBeacon` avec un corps `text/plain` qui contient du JSON. C'est une requête CORS simple, sans requête préalable, qui part même quand on quitte la page.
- **Données envoyées** : `{ k, t, p, r }`, soit la clé, le type, le chemin sans paramètres ni ancre, et le **domaine** de provenance. La provenance n'est envoyée qu'à la première vue de la visite et seulement si elle est externe.
- **Rien n'est envoyé** si le marqueur `dashility-ignore` est présent dans le `localStorage`, si `navigator.webdriver` est vrai, ou si le site tourne sur `localhost`.
- **Lien magique** : `?dashility-ignore=1` pose le marqueur, `?dashility-ignore=0` le retire. Le paramètre est ensuite effacé de l'URL et une confirmation discrète s'affiche.
- **Budget** : moins de 2 Ko compressé, vérifié en CI.
- L'endpoint s'appelle `/api/e` plutôt que `/collect` ou `/analytics`, des mots que les bloqueurs de publicité filtrent.

### Côté serveur

1. Le serveur cherche l'espace par `k`, puis rejette l'événement si l'en-tête `Origin` ne correspond pas à son `site_url`.
2. Il valide l'événement avec Zod : `t` vaut `view` ou `cv`, `p` fait 512 caractères au plus, `r` est un nom de domaine.
3. Il ignore les `User-Agent` de robots, avec une expression régulière des robots courants.
   `shortcut: liste de robots maison, passer au paquet isbot si des robots passent au travers`
4. Il insère l'événement dans `events` et le publie aux flux SSE ouverts sur cet espace.
5. Il répond toujours `204`, sans détail, même en cas de rejet.

- **Provenance** : elle est regroupée à la lecture, pas au stockage. `linkedin.com` et `lnkd.in` deviennent LinkedIn, `github.com` devient GitHub, `google.*` devient Google, une valeur vide devient « Accès direct », et les autres gardent leur domaine.
- **Temps réel** : un `EventEmitter` en mémoire relie la collecte aux flux SSE.
  `shortcut: diffusion en mémoire, valable pour une seule instance ; passer à LISTEN/NOTIFY de PostgreSQL si l'API est répliquée`
- **Rétention** : une tâche quotidienne (`@nestjs/schedule`, 3 h) supprime les événements de plus de 6 mois.
- **Lecture** : les agrégats sont calculés à la volée depuis `events`. Au volume d'un portfolio, aucune table d'agrégats n'est nécessaire.

## Dashboard

- Une page par écran du document UX, chargée à la demande par le routeur.
- Pinia ne contient que la session (`/auth/me`). Le reste est lu écran par écran via le composable `useApi`, un `fetch` typé par les schémas de `packages/shared`.
- Un garde de route envoie vers `/connexion?retour=…` si aucune session n'est ouverte.
- Le temps réel utilise `EventSource` sur `/api/spaces/:slug/analytics/live`, avec reconnexion automatique et un bouton pause.
- L'accessibilité vise WCAG 2.2 AA : composants shadcn-vue (Reka UI), une alternative en tableau pour la courbe, et des tests Playwright au clavier sur les parcours V1.

## V2 : contenu

S'appuie sur le document UX, section « Écrans V2 », et sur les décisions du 6 novembre 2026.

### Modèle de données

```mermaid
erDiagram
    spaces ||--o{ content_types : définit
    content_types ||--o{ entries : contient
    spaces ||--o{ media : stocke
    content_types {
        uuid id PK
        uuid space_id FK
        text slug "unique dans l'espace, figé"
        text kind "collection ou single, figé"
        text name "au pluriel"
        text entry_label "« un projet »"
        int position
        jsonb fields "définitions des champs"
    }
    entries {
        uuid id PK
        uuid type_id FK
        text slug "collections ; unique dans le type"
        jsonb published "version en ligne, null si jamais publiée"
        jsonb draft "modifications en attente, null s'il n'y en a pas"
        bool en_complete "calculé à chaque écriture"
        int version "contrôle des écritures concurrentes"
        timestamptz published_at
        timestamptz updated_at
        uuid updated_by FK
    }
    media {
        uuid id PK
        uuid space_id FK
        text kind "image ou pdf"
        text original_name
        int width
        int height
        int bytes
        timestamptz created_at
    }
```

`spaces` gagne `api_key_hash`, `api_key_created_at`, `deploy_url`, `deploy_token` et le résultat du dernier appel (`deploy_called_at`, `deploy_status`).

**Statut d'une entrée**, déduit des deux colonnes JSONB, sans colonne `status` qui pourrait les contredire :

| `published` | `draft` | Statut (document UX) |
| --- | --- | --- |
| null | rempli | Brouillon |
| rempli | null | Publié |
| rempli | rempli | Publié, avec des modifications en attente |

- **Sauvegarde automatique** : elle écrit toujours dans `draft`. « Publier » copie `draft` dans `published` et vide `draft` ; « Annuler les modifications » vide `draft` ; « Dépublier » remet `published` dans `draft` et vide `published`. Le site ne lit que `published`.
- **Écritures concurrentes** : chaque écriture envoie la `version` lue ; si elle ne correspond plus, l'API répond `409` et l'éditeur affiche « Recharger la dernière version ».
- **Ordre des types** : `position`, modifiable dans Structure. L'ordre des entrées est laissé aux sites (PRD).

### Définition des champs et valeurs

`fields` est un tableau, validé par un schéma Zod de `packages/shared` :

```ts
type Field = {
  key: string          // identifiant, figé ; sert de clé dans les valeurs et dans l'API
  label: string
  type: 'text' | 'richtext' | 'choice' | 'date' | 'link' | 'list' | 'number' | 'boolean' | 'image' | 'pdf' | 'group'
  required: boolean
  translatable: boolean // figé ; ignoré pour group, porté par les sous-champs
  options?: …           // selon le type : maxLength, choix { key, fr, en }, période et précision, min et max d'un groupe, sous-champs
}
```

- **Valeurs** : un objet indexé par `key`. Un champ traduisible vaut `{ fr, en }`, un champ non traduisible vaut sa valeur. Un groupe vaut un tableau d'objets, construits de la même façon pour ses sous-champs : les éléments sont communs aux deux langues (document UX).
- **Valeurs par type** : `choice` garde la clé du choix (le libellé vient de la définition), `date` vaut `{ start, end?, ongoing? }` en ISO (`2026-10`), `image` vaut `{ id, alt: { fr, en } }`, `pdf` vaut l'`id` du fichier (un par langue si traduisible), `richtext` vaut un document Tiptap (JSON).
- **Un seul schéma Zod, construit à partir de `fields`**, sert à l'API et au dashboard, en deux modes : *brouillon* (types et formats seulement, tout peut être vide) et *publication* (champs obligatoires en français, en plus). `en_complete` vérifie les champs obligatoires traduisibles en anglais.
- **Modification de la structure** : supprimer un champ retire sa clé de `published` et de `draft` de toutes les entrées du type, dans une transaction. Ajouter un champ obligatoire ne touche pas aux entrées : la règle s'applique à la prochaine publication (document UX). Ce qui est figé est refusé par l'API, pas seulement masqué dans le dashboard.

### Texte riche

- **Saisie** : Tiptap, limité aux extensions du document UX (paragraphe, gras, italique, lien, listes, intertitre `h2` et `h3`, mise en avant). Le collage ne garde que ces éléments, puisque Tiptap retire ce que son schéma ne connaît pas.
- **Stockage** : le document JSON de Tiptap. L'API le valide contre la même liste de nœuds et de marques (`richtextSchema` de `packages/shared`, sans dépendance à Tiptap) ; un lien doit être en `http(s)` ou `mailto`, les listes s'imbriquent sur 4 niveaux au plus, et les attributs inconnus sont retirés. Un document sans texte compte comme vide pour la règle « obligatoire » et pour la version anglaise.
- **Chargement** : l'éditeur (environ 120 Ko compressés) est chargé à la demande, seulement quand une entrée a un champ de texte riche.
- **Lecture par les sites** : l'API publique renvoie du HTML généré à partir du JSON par `@tiptap/html`, avec les mêmes extensions. Le HTML ne contient donc que ces balises, et le texte est échappé. La mise en avant devient `<mark>` ; le site lui donne son style.

### Médias

- **Stockage** : sur le NAS, dans `/mnt/nas/media/dashility/medias`, monté dans le conteneur `app` en `/data/medias` (variable `MEDIA_DIR`), avec `create_host_path: false` comme pour les sauvegardes. Un fichier par dossier : `<id de l'espace>/<id>/original.<ext>` (l'identifiant de l'espace, pas son slug, qui peut changer), et pour une image `640.webp`, `640.avif`, `1280.webp`… Le NAS est en RAID : une panne de disque ne perd rien.
- **Envoi** : `POST /api/spaces/:slug/media` en `multipart/form-data` (multer, déjà fourni par `@nestjs/platform-express`), 10 Mo au plus. Le type réel est vérifié : `sharp` doit savoir lire une image (JPEG, PNG ou WebP), et un PDF doit commencer par `%PDF-`. Le nom du fichier n'est jamais utilisé comme chemin.
- **Variantes** : à l'envoi, en WebP et en AVIF, en 640, 1280 et 1920 px de large, sans agrandir une image plus petite. Les métadonnées EXIF (lieu de la photo) sont retirées.
- **Service** : `GET /api/media/:id/:fichier`, public, avec `Cache-Control: public, max-age=31536000, immutable`. Un nouveau fichier a toujours un nouvel `id`, donc une adresse en cache n'a jamais besoin d'être invalidée.
  `shortcut: un média est public dès qu'il est envoyé, même s'il n'est utilisé que dans un brouillon ; son id (UUID aléatoire) ne se devine pas. Servir seulement les médias publiés si un espace a du contenu confidentiel`
- **Fichiers orphelins** : remplacer ou retirer une image n'efface rien tout de suite, puisque `published` peut encore l'utiliser. Une tâche quotidienne supprime les médias de plus de 24 h qui n'apparaissent ni dans `published` ni dans `draft` d'aucune entrée de leur espace.
- **NAS injoignable** : l'envoi répond `503` (« Le stockage des fichiers est indisponible »), le service répond `404`. L'édition du texte continue.
- **Sauvegarde** : les fichiers ne sont pas dans le `pg_dump`. Ils sont protégés des pannes de disque par le RAID du NAS, pas d'une suppression : les instantanés (snapshots) du QNAP sur ce dossier, s'ils sont activés, couvrent ce cas. Risque accepté (PRD : « une perte de données est acceptable »).

### API du dashboard (V2)

Mêmes règles que la V1 : session, `SpaceAccessGuard`, 404 pour un espace inaccessible, format d'erreur unique.

| Méthode et route | Accès | Rôle |
| --- | --- | --- |
| `GET /spaces/:slug/types` | Membre | Types de l'espace, avec leurs compteurs (entrées, publiées, EN incomplet) ; chaque route qui renvoie un type renvoie aussi ses compteurs |
| `POST /spaces/:slug/types` | Super-admin | Crée un type |
| `PUT /spaces/:slug/types/:type` | Super-admin | Enregistre le type (noms, champs, ordre) ; refuse ce qui est figé |
| `DELETE /spaces/:slug/types/:type` | Super-admin | Supprime le type et ses entrées |
| `PUT /spaces/:slug/type-order` | Super-admin | Ordre des types (hors de `/types/`, où `order` pourrait être un type) |
| `GET /spaces/:slug/types/:type/entries` | Membre | Liste : id, titre, slug, statut, EN complet, date de modification (le filtre par statut se fait dans le dashboard) |
| `POST /spaces/:slug/types/:type/entries` | Membre | Crée une entrée (brouillon) |
| `GET /spaces/:slug/types/:type/entries/:id` | Membre | Entrée complète (`published`, `draft`, `version`) ; pour une page unique, `:id` vaut `single` |
| `PATCH /spaces/:slug/types/:type/entries/:id` | Membre | Sauvegarde automatique : `{ version, data, slug? }` dans `draft` |
| `POST /spaces/:slug/types/:type/entries/:id/publish` | Membre | `{ version }` : publie le brouillon après les contrôles de publication ; sinon 400 `publication_invalid` avec la liste des champs fautifs (`issues`) |
| `POST /spaces/:slug/types/:type/entries/:id/discard` | Membre | `{ version }` : annule les modifications en attente |
| `POST /spaces/:slug/types/:type/entries/:id/unpublish` | Membre | `{ version }` : dépublie, en gardant le contenu (et les modifications en attente) en brouillon |
| `DELETE /spaces/:slug/types/:type/entries/:id` | Membre | Supprime (sauf une page unique) |
| `POST /spaces/:slug/media` | Membre | Envoie une image ou un PDF |
| `POST /spaces/:slug/api-key` | Super-admin | Génère ou régénère la clé ; la renvoie une seule fois |
| `PUT /spaces/:slug/deploy` | Super-admin | `{ url, token? }` |
| `GET /spaces/:slug/deploy` | Membre | État du déploiement : configuré, appel en attente, dernier appel ; l'URL et la présence d'un jeton pour le super-admin |
| `POST /spaces/:slug/deploy` | Membre | Lance un déploiement tout de suite (« Lancer un déploiement », « Relancer ») |

- **Ce qui est réservé au super-admin est vérifié par l'API**, pas seulement caché dans le dashboard.
- **Publier, dépublier ou supprimer une entrée publiée** demande un déploiement (voir plus bas).

### API publique de lecture (`/api/v1`)

```
GET /api/v1/content/:type?locale=fr          collection : tableau des entrées publiées ; page unique : l'entrée
GET /api/v1/content/:type/:slug?locale=fr    une entrée d'une collection
Authorization: Bearer <clé API de l'espace>
```

- **La clé identifie l'espace**, il n'y a donc pas d'espace dans l'URL. Elle fait 32 octets aléatoires, préfixée par `dly_` pour être reconnue dans un dépôt de code par erreur ; on ne stocke que son empreinte SHA-256, comme les sessions.
- **Lecture côté serveur uniquement** : elle sert au build des sites (GitHub Actions) ou à leur serveur. Pas de CORS, puisque la clé ne doit jamais être dans un navigateur.
- **Réponse résolue pour la langue** : un champ traduisible renvoie la valeur de `locale` ; un choix renvoie `{ key, label }` ; le texte riche renvoie `{ html }` ; une image renvoie `{ alt, width, height, src, srcset: { webp, avif } }` avec des URL absolues ; un PDF renvoie `{ url, bytes }`.
- **`locale=en`** n'inclut que les entrées dont la version anglaise est complète (PRD, « Langues »).
- **Valeur par défaut** : un champ « oui / non » jamais touché n'a pas de valeur enregistrée ; l'API renvoie sa valeur par défaut, celle que l'éditeur affiche.
- **Chaque entrée** vaut `{ slug, publishedAt, fields }` : `slug` pour une collection, `publishedAt` la date de la dernière publication, et les valeurs dans `fields` (un champ peut s'appeler `slug`). Pas d'`updatedAt` : il changerait à chaque sauvegarde d'un brouillon, que le site ne voit pas.
- **Adresses absolues** des médias construites à partir de la requête (`X-Forwarded-Proto` et `Host`, derrière Nginx Proxy Manager).
- Limitée à 120 requêtes par minute par clé. Documentée en OpenAPI sur `/api/docs` (document écrit à la main, servi par `@nestjs/swagger` ; JSON sur `/api/docs-json`).

### Déploiement à la publication

- **Appel** : `POST deploy_url` avec le corps JSON `{ "event_type": "dashility-publish", "client_payload": { "space": "<slug>" } }` et, si un jeton est enregistré, l'en-tête `Authorization: Bearer <jeton>`. Ce format est celui de `repository_dispatch` de GitHub ; les hooks de build qui n'attendent rien (Netlify, Vercel…) ignorent le corps.
- **Regroupement** : l'appel part 10 secondes après la dernière publication de l'espace. Publier trois entrées à la suite ne lance qu'un build.
  `shortcut: minuteur en mémoire, perdu si l'API redémarre pendant ces 10 s et valable pour une seule instance ; le bouton « Lancer un déploiement » rattrape le cas`
- **Résultat** : le statut HTTP (ou « injoignable ») et l'heure sont enregistrés sur l'espace et affichés dans l'éditeur. Délai de 10 s, pas de nouvel essai automatique : le bouton « Relancer » suffit.
- **Sécurité** : `deploy_url` doit être en `https`, et seul le super-admin la règle. Le jeton n'est jamais renvoyé par l'API après son enregistrement (l'écran affiche « Jeton enregistré »). Il est stocké en clair, puisqu'il faut l'envoyer ; il doit donc avoir le moins de droits possible (pour GitHub : un jeton à grain fin limité au dépôt du site, permission « Contents » en écriture, la seule qui autorise `repository_dispatch`).

### Le portfolio (migration, dans son propre dépôt)

À faire après la V2, sur demande du propriétaire :

- `.github/workflows/contenu.yml` sur `repository_dispatch` (`dashility-publish`) : il lit le contenu par l'API publique (clé dans un secret GitHub), télécharge les images, build et publie l'image Docker sans relancer les tests. Les images restent servies par le site lui-même : sa CSP `img-src 'self'` ne change pas.
- **Objectif de moins de 5 minutes** (PRD) : environ 2 à 3 min de build, puis la tâche cron du serveur. Elle passe de 5 minutes à 1 minute pour le portfolio, sinon l'attente seule peut dépasser l'objectif.
- Le contenu Markdown et TypeScript actuel est recopié dans les types du document UX, puis lu par l'API au build.

## V3 : publication programmée

S'appuie sur le document UX, section « V3 : publication programmée », et sur les décisions du 8 novembre 2026.

### Données

`entries` gagne deux colonnes :

| Colonne | Rôle |
| --- | --- |
| `scheduled_at` (timestamptz, null) | Heure prévue de la publication ; null s'il n'y a pas de programmation |
| `last_schedule` (jsonb, null) | Issue de la dernière programmation, pour le message de l'éditeur : `{ plannedAt, outcome, at, message? }`, avec `outcome` = `published`, `cancelled` ou `failed` |

- **Une version figée sans copie** : comme toute modification annule la programmation, la version programmée est simplement la version actuelle de l'entrée. Pas de troisième exemplaire du contenu, ni de numéro de version à garder à part.
- **Index partiel** sur `scheduled_at` (`where scheduled_at is not null`) : la tâche de chaque minute ne lit que les entrées programmées.
- `last_schedule` est effacé à la prochaine écriture de l'entrée : le message « Publiée comme prévu » ne reste que jusqu'au prochain enregistrement (document UX).

### Ce qui annule une programmation

Toute écriture qui change la version de l'entrée annule sa programmation, dans la même requête SQL : `scheduled_at` passe à null et `last_schedule` reçoit `{ outcome: 'cancelled' }`. C'est le helper `nextVersion` qui change la version : il porte l'annulation, et aucune écriture ne peut l'oublier.

- **« Modifier l'entrée »** : le dashboard appelle d'abord l'annulation (route ci-dessous), puis rend les champs modifiables. La sauvegarde automatique d'une entrée programmée est refusée par l'API (409, code `entry_scheduled`) : un éditeur ouvert avant la programmation ne peut donc rien écrire sans le savoir.
- **Changement de structure** : `TypesService.update` change déjà la version de toutes les entrées du type (V2) ; il annule leurs programmations au passage.
- **« Publier » maintenant, « Annuler les modifications », « Dépublier »** : ils changent la version, donc retirent la programmation. « Publier » ne laisse pas de message d'annulation, puisque c'est la publication voulue.

### Programmer, annuler

| Méthode et route | Accès | Rôle |
| --- | --- | --- |
| `PUT /spaces/:slug/types/:type/entries/:id/schedule` | Membre | `{ version, at }` : programme ou change la date. Mêmes contrôles que `publish` (`publicationIssues`, identifiant d'URL), `at` entre maintenant + 1 min et + 1 an (`scheduleIssue`, partagé avec le dashboard). N'écrit que si `version` est la version actuelle, et ne la change pas |
| `DELETE /spaces/:slug/types/:type/entries/:id/schedule` | Membre | Annule la programmation, sans message d'annulation (c'est un choix, pas un incident) |

- L'entrée renvoyée par l'API gagne `scheduledAt` et `lastSchedule` ; la liste des entrées, `scheduledAt` ; les compteurs d'un type, `scheduled`.
- `at` est un instant ISO en UTC. Le dashboard convertit la date et l'heure saisies **à l'heure de Paris**, quelle que soit l'heure de l'ordinateur ; le helper partagé `parisDateTime(date, time)` calcule le décalage avec `Intl` (heure d'été comprise). Une heure qui n'existe pas (le passage à l'heure d'été, 2:30 un dernier dimanche de mars) est avancée à l'heure suivante.

### Exécution

- **Une tâche chaque minute** (`@nestjs/schedule`, `@Cron('* * * * *')`) lit les entrées dont `scheduled_at <= now()`, avec `for update skip locked` : deux instances de l'API ne publieraient pas deux fois la même entrée.
- **Pour chaque entrée** : la publication est faite comme `publish`, avec les mêmes contrôles et la même écriture (`published` reçoit `draft`, l'identifiant en attente passe en ligne, la version change) ; `last_schedule` reçoit `{ outcome: 'published', at }`. Si un contrôle échoue (une règle a changé), rien n'est publié et `last_schedule` reçoit `{ outcome: 'failed', message }`. Dans tous les cas, la programmation est retirée.
- **Déploiement** : chaque espace touché reçoit `DeployService.schedule`, donc un seul build pour plusieurs publications de la même minute.
- **Rattrapage** : une publication manquée pendant un arrêt de l'API part au premier passage de la tâche après le démarrage (au plus une minute). `last_schedule.at` garde l'heure réelle, que l'éditeur affiche à côté de l'heure prévue.
- **Auteur** : la tâche ne change pas `updated_by`, qui reste l'auteur de la dernière modification du contenu publié.

## V3 : prévisualisation

S'appuie sur le document UX, section « V3 : prévisualisation », et sur les décisions du 11 novembre 2026.

```mermaid
sequenceDiagram
    participant E as Éditeur (dashboard)
    participant A as API Dashility
    participant S as Page d'aperçu (site)
    E->>A: POST …/entries/:id/preview (session)
    A-->>E: { url, expiresAt }
    E->>S: nouvel onglet : <preview_url>?dashility-preview=<jeton>
    S->>A: GET /api/preview/<jeton>?locale=fr (CORS, sans clé)
    A-->>S: l'entrée, version en cours, même forme que /api/v1
```

### Données

Une table `preview_links`, sur le modèle des sessions et des liens à usage unique :

| Colonne | Rôle |
| --- | --- |
| `id` (text, PK) | Empreinte SHA-256 du jeton (`newToken`, `hashToken`) ; le jeton lui-même n'est jamais stocké |
| `entry_id` (uuid, null, FK `entries` `on delete set null`) | L'entrée prévisualisée ; null quand elle a été supprimée, pour répondre « Cette entrée n'existe plus » plutôt que « lien invalide » |
| `expires_at` (timestamptz) | Création + 24 h |

- **Un lien par clic** : chaque « Prévisualiser » ou « Copier le lien d'aperçu » crée une ligne. Pas de réutilisation ni de révocation (décision du 11 novembre 2026).
- **Purge** : la tâche de rétention de 3 h supprime les liens expirés depuis plus de 7 jours. Entre-temps, un lien expiré répond « expiré » plutôt que « invalide ».

`spaces` gagne `preview_url` (text, null) : l'adresse de la page d'aperçu du site.

### Routes

| Méthode et route | Accès | Rôle |
| --- | --- | --- |
| `POST /spaces/:slug/types/:type/entries/:id/preview` | Membre | Crée un lien ; renvoie `{ url, expiresAt }`. 409 `preview_not_configured` si l'espace n'a pas de `preview_url` |
| `PATCH /spaces/:slug` | Super-admin | Accepte `previewUrl` (ou `null` pour le retirer), comme les autres réglages de l'espace |
| `GET /api/preview/:token?locale=fr\|en` | Public, avec le jeton | L'entrée, version en cours |

- **`url`** est construite par l'API : `preview_url` avec le paramètre `dashility-preview=<jeton>` ajouté par `URL.searchParams` (une adresse qui a déjà des paramètres reste valable).
- **`/auth/me`** renvoie `previewUrl` avec chaque espace : l'éditeur sait s'il doit afficher « Prévisualiser » sans requête de plus.
- **`preview_url`** : même règle que `site_url` (https, ou http sur `localhost` pour tester un site en local), mais le chemin est gardé. `GET /spaces/:slug` la renvoie à tous les membres.

### Lecture d'un aperçu (`GET /api/preview/:token`)

- **Version en cours** : `draft ?? published`, et `draft_slug ?? slug`. C'est ce que montre l'éditeur, y compris pour une entrée programmée (sa version figée) ou publiée sans modification (la version en ligne).
- **Même forme que l'API publique**, pour que le site réutilise ses chargeurs : `resolveData` et la lecture des médias de `PublicApiService.resolve` sont mises en commun. S'y ajoutent ce dont le bandeau a besoin :

```ts
{
  type: string                    // identifiant du type : le site choisit la page à afficher
  kind: 'collection' | 'single'
  slug?: string
  fields: …                       // résolus pour `locale`, comme /api/v1
  status: 'draft' | 'published' | 'modified'   // entryStatus, comme l'éditeur
  enComplete: boolean             // le bandeau prévient si l'anglais est incomplet
  expiresAt: string
}
```

- **En anglais, l'entrée est renvoyée même incomplète** (contrairement à `/api/v1`) : un champ sans valeur anglaise vaut `null`, et `enComplete` vaut `false`.
- **Erreurs** : 404 `preview_not_found` (jeton inconnu), 410 `preview_expired`, 404 `preview_entry_deleted`. Le site affiche le message du document UX selon le code.
- **CORS** : `Access-Control-Allow-Origin: *`, seulement sur cette route, posé aussi sur les réponses d'erreur. Le jeton est le seul secret (un `curl` le lit de toute façon) ; restreindre l'origine n'apporterait rien et empêcherait le site de lire l'erreur d'un jeton inconnu, dont on ignore l'espace (« Tester » en dépend). La requête est simple (`GET` sans en-tête particulier) : pas de requête préalable. Pas de cookies.
- **En-têtes** : `Cache-Control: no-store` (un brouillon change), `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`.
- **Débit** : 60 requêtes par minute par IP, avec le `ThrottlerModule` déjà en place. Le jeton fait 32 octets aléatoires : il ne se devine pas.
- **Documentation** : la route figure dans le document OpenAPI de `/api/docs`, avec ses codes d'erreur.
- **Médias** : les images d'un brouillon sont déjà servies par `/api/media/<id>/…` (adresse non devinable, `Cross-Origin-Resource-Policy: cross-origin`). Rien ne change côté médias.

### Dashboard

- **Ouverture sans blocage de fenêtre** : le navigateur bloque un `window.open` fait après un `await`. « Prévisualiser » ouvre donc l'onglet tout de suite (`window.open('', '_blank')`), enregistre la saisie, demande le lien, puis donne son adresse à l'onglet. En cas d'échec, l'onglet est refermé et l'erreur s'affiche dans l'éditeur.
- **« Copier le lien d'aperçu »** : `navigator.clipboard.writeText` après la réponse. Si le navigateur refuse (délai du geste dépassé), le lien s'affiche dans un champ sélectionnable avec « Copier ».
- **Réglages › Intégration** : champ « URL d'aperçu » et « Tester », qui ouvre `preview_url?dashility-preview=essai`. La page doit afficher le message « lien expiré » : c'est la preuve qu'elle existe et qu'elle interroge Dashility.

### Ce que le site doit faire (contrat)

À décrire dans les extraits d'installation de Réglages › Intégration, et à faire dans le portfolio (dans son dépôt, après Dashility) :

1. Une page à l'adresse de `preview_url`, exclue du pré-rendu et des sitemaps, avec `<meta name="robots" content="noindex">`.
2. Elle lit `dashility-preview` dans l'URL, appelle `GET /api/preview/<jeton>?locale=…` et affiche l'entrée avec ses composants, selon `type`. Le bandeau, le sélecteur FR / EN et les états sont ceux du document UX.
3. Sa CSP ouvre `connect-src` et `img-src` à l'origine de Dashility (pour le portfolio, `img-src` n'accepte aujourd'hui que `'self'`).
4. Elle ne compte pas la visite : le script de collecte s'en charge (ci-dessous).

### Script de collecte

`send` n'envoie rien si l'URL courante contient `dashility-preview`. La suite de la visite (une navigation vers une autre page du site) est comptée normalement. Nouvelle version mineure du paquet npm `@dashility/client` (0.2.0), publiée à la main comme les précédentes ; le budget de 2 Ko ne bouge pas.

## V3 : mise en avant

S'appuie sur le PRD (« Score d'effet et mise en avant »), le document UX (« V3 : mise en avant ») et les décisions du 12 novembre 2026.

### Données

`content_types` gagne une colonne `featuring` (jsonb, null : pas de mise en avant) :

```ts
type Featuring = {
  paths: { fr: string; en?: string } // modèles d'adresse : « /fr/projets/{slug} »
  forceField?: string                // clé d'un champ « oui / non » du type
}
```

- **Validation** (`featuringSchema`, `packages/shared`, ajouté à `contentTypeSchema`) : chaque modèle commence par `/`, contient `{slug}` une fois, 200 caractères au plus. Le type doit être une collection, et `forceField` désigner un champ de premier niveau de type `boolean`. Un type qui ne respecte pas ces règles est refusé à l'enregistrement (400) ; quand on supprime le champ de forçage dans Structure, le dashboard retire aussi `forceField`.
- **Constantes** (`packages/shared`) : `FEATURED_PLACES = 3`, `FEATURED_MIN_VIEWS = 20`. La durée est celle de la rétention des événements (6 mois) : on compte tous les événements gardés.
- Pas de table de classement : il se calcule à la demande. Au volume d'un portfolio (quelques projets, quelques milliers d'événements), c'est une requête groupée.

### Calcul (`FeaturingService`)

1. **Les entrées** : les entrées publiées du type (`published` non nul), avec leur identifiant d'URL publié (`slug`) et la valeur publiée du champ de forçage.
2. **Les chemins** : pour chaque entrée, `paths.fr` et `paths.en` avec `{slug}` remplacé. Une table chemin → entrée.
3. **Les événements** : `select path, kind, count(*) from events where space_id = $1 and path = any($2) group by path, kind`. L'index `(space_id, created_at)` suffit ; la rétention borne déjà la période à 6 mois.
4. **La sélection**, par une fonction pure partagée, `featuredSelection(rows, seed)`, testée seule :
   - score = `cv / views` si `views >= 20`, sinon pas de score ;
   - **forcés** d'abord, triés par score puis par vues ; puis les **classés** par score décroissant (à égalité, le plus de vues) ; jusqu'à 3 places ;
   - les places restantes sont **tirées** parmi les autres entrées, dans un ordre pseudo-aléatoire : tri par `sha256(seed + id)`.
   - Renvoie chaque entrée avec `views`, `cv`, `score`, `forced`, `rank` (rang parmi les classés), et `featured` : `forced`, `ranked`, `drawn` ou null.

**Le tirage du jour.** `seed` est la date du jour à l'heure de Paris (`2026-11-12`) et l'identifiant du type. Le build du site appelle l'API une fois par langue : le même jour, les deux appels tirent les mêmes projets, et deux builds le même jour aussi. Le build nocturne change de jour, donc de tirage.

### API publique (`/api/v1`)

```
GET /api/v1/featured/:type?locale=fr
Authorization: Bearer <clé API de l'espace>
```

- Hors de `/content/:type/…` : `/content/projets/featured` serait lu comme l'entrée d'identifiant `featured`.
- **Réponse** : les entrées mises en avant, dans l'ordre (forcées, classées, tirées), au même format que `/content` (`{ slug, publishedAt, fields }`, résolues pour la langue), plus `featured: 'forced' | 'ranked' | 'drawn'`.
- **En anglais**, une entrée incomplète en anglais est sautée (comme dans `/content`) et la suivante dans l'ordre prend sa place : la sélection anglaise peut différer de la française.
- **Erreurs** : 404 `type_not_featured` si le type n'a pas de mise en avant, 404 si le type n'existe pas. Même clé, même limite de débit et même OpenAPI que le reste de `/api/v1`.

### API du dashboard

| Méthode et route | Accès | Rôle |
| --- | --- | --- |
| `GET /spaces/:slug/analytics/featured` | Membre | Pour chaque type mis en avant : `{ type: { slug, name }, places, minViews, rows, drawnPlaces }`, `rows` étant les entrées publiées avec `id`, titre (`entryTitle`), vues, CV, score, `forced`, `rank`, `featured` (sans les tirées) |
| `PUT /spaces/:slug/types/:type` | Super-admin | Accepte `featuring`, comme le reste du type |

- Le tableau d'Analytics ne montre pas le tirage, qui dépend du jour : `drawnPlaces` dit combien de places restent au hasard.

### Dashboard

- **Structure** : un composant `FeaturingSettings` dans l'éditeur d'un type de collection (case, deux modèles d'adresse, liste des champs oui / non). Supprimer le champ de forçage vide `forceField`.
- **Analytics** : un composant `FeaturedSection` sous Pages et Provenances, un tableau par type ; le titre ouvre l'entrée.

### Le portfolio (dans son dépôt)

- `scripts/contenu.ts` lit `/api/v1/featured/projets?locale=…` et écrit la liste des identifiants dans `content/<langue>/mis-en-avant.json` ; l'accueil l'utilise au lieu de filtrer « À la une ».
- Un build nocturne : `schedule` (cron, vers 4 h à Paris) dans le workflow qui lit le contenu et publie l'image, comme un `repository_dispatch`.
- Rien ne change pour le reste du contrat : `a_la_une` reste un champ « oui / non » des projets.

## V4 : historique et corbeille

S'appuie sur le PRD (« V4 : filet de sécurité et organisation »), le document UX (« V4 : historique et corbeille ») et les décisions du 13 novembre 2026.

### Données

```mermaid
erDiagram
    entries ||--o{ entry_versions : publie
    entry_versions {
        uuid id PK
        uuid entry_id FK "on delete cascade"
        int number "1, 2, 3… ; unique avec entry_id"
        jsonb data "contenu publié, comme entries.published"
        timestamptz published_at
        uuid published_by FK "null : publication programmée, ancien membre ou version d'origine"
        bool scheduled "publiée par la tâche de chaque minute"
    }
```

`entries` gagne `deleted_at` (timestamptz, null) et `deleted_by` (uuid, `on delete set null`), avec un index partiel `where deleted_at is not null` pour la corbeille et sa purge.

- **Une version par publication.** `publish` et la tâche `publishDue` insèrent la version dans la **même transaction** que l'écriture de `published` : `number` = le plus grand numéro de l'entrée + 1. La ligne de l'entrée est verrouillée par l'écriture (contrôle de `version`), donc deux publications simultanées ne prennent pas le même numéro ; la contrainte unique `(entry_id, number)` le garantit en dernier recours.
- **« En ligne »** : la version la plus récente, si `entries.published` n'est pas nul. Toute écriture de `published` passe par une publication (qui crée une version) ou par « Dépublier » (qui le vide) : pas de colonne de plus à tenir à jour. Seule exception, supprimer un champ dans Structure retire sa clé de `published` sans créer de version ; la version en ligne garde alors une valeur que le site ne voit plus, ce qui ne change rien à la restauration (voir ci-dessous).
- **Pas d'identifiant d'URL dans une version** (document UX) : `data` ne contient que les valeurs des champs.
- **Volume** : quelques Ko par version, gardées sans limite (PRD). `shortcut: aucune purge des versions ; en garder les 50 dernières par entrée si la base grossit`

**Mise en route** (migration `0011_historique_corbeille`) : la table, les deux colonnes, puis une version 1 pour chaque entrée publiée, avec `data = published`, `published_at` de l'entrée et `published_by` nul : on ne sait pas qui l'a publiée. Le panneau l'affiche sans auteur.

### Restaurer une version

`POST …/versions/:number/restore` avec la `version` lue de l'entrée :

1. `data` de la version passe par `entryPruner(fields)` du type **actuel** : un champ supprimé depuis, ou un choix retiré, perd sa valeur ; un champ ajouté depuis reste vide.
2. Le résultat est écrit dans `draft` par le helper `write`, comme une sauvegarde : la version de l'entrée change, ce qui annule une programmation (V3), et `en_complete` est recalculé.
3. Rien n'est publié, rien n'est déployé.

### Corbeille

- **Mettre à la corbeille** (`DELETE …/entries/:id`, qui supprimait définitivement) : `deleted_at = now()`, `deleted_by`, par `write`, donc la programmation est annulée. `published` et `draft` ne bougent pas. Si l'entrée était publiée, `DeployService.schedule` : le site la retire au prochain build.
- **Une entrée de la corbeille n'existe plus ailleurs.** Toutes les lectures d'entrées ajoutent `isNull(entries.deletedAt)` : liste, `byId` (une entrée de la corbeille répond 404 dans l'éditeur), À traiter, compteurs des types, API publique, aperçu, mise en avant, tâche de programmation. Un helper `alive` dans `entries.service.ts` porte la condition ; un test par surface vérifie qu'une entrée de la corbeille n'y apparaît pas.
- **L'identifiant d'URL reste réservé** : la contrainte unique `(type_id, slug)` ne change pas. Une nouvelle entrée qui le demande reçoit le code `slug_in_trash` et le message du document UX.
- **Restaurer** (`POST /spaces/:slug/trash/:id/restore`) : `deleted_at` et `deleted_by` repassent à null, et l'entrée est dépubliée au passage, comme « Dépublier » (`draft` reçoit `draft ?? published`, `published` passe à null, l'identifiant en attente devient l'identifiant). Elle revient donc **en brouillon**, avec son historique, sans déploiement. Le « Annuler » qui suit une suppression appelle la même route : l'entrée revient elle aussi en brouillon.
- **Purge** : une tâche quotidienne (`@Cron('15 3 * * *')`, heure de Paris) supprime les entrées dont `deleted_at` a plus de 30 jours ; leurs versions partent par la cascade. Elle passe avant la purge des médias orphelins (3 h 30), qui libère leurs fichiers le soir même.
- **Supprimer un type** supprime ses entrées, corbeille comprise, comme aujourd'hui (cascade).

### Médias

- **Une image d'une ancienne version reste servie** : la purge des orphelins compte aussi les références de `entry_versions.data` (même `mediaRefs`, avec la définition actuelle du type). Une image retirée d'une entrée n'est donc effacée que quand plus aucune version ne la cite, c'est-à-dire quand l'entrée part de la corbeille. `shortcut: les images citées par une version ne sont jamais effacées tant que l'entrée existe ; à revoir avec une purge des versions`
- `mediaRefs` lit les références avec la définition **actuelle** : une image d'un champ supprimé depuis n'est plus comptée, et son fichier peut partir. La version restaurée perd de toute façon ce champ (`entryPruner`).

### Routes

Mêmes règles que la V2 : session, `SpaceAccessGuard`, 404 pour un espace inaccessible, format d'erreur unique.

| Méthode et route | Accès | Rôle |
| --- | --- | --- |
| `GET /spaces/:slug/types/:type/entries/:id/versions` | Membre | Les versions, de la plus récente à la plus ancienne : `number`, `publishedAt`, `publishedBy` (email ou null), `scheduled`, `online`. Sans `data` |
| `GET /spaces/:slug/types/:type/entries/:id/versions/:number` | Membre | Une version, avec `data` |
| `POST /spaces/:slug/types/:type/entries/:id/versions/:number/restore` | Membre | `{ version }` : restaure dans le brouillon ; renvoie l'entrée |
| `DELETE /spaces/:slug/types/:type/entries/:id` | Membre | Met à la corbeille (n'efface plus) |
| `GET /spaces/:slug/trash` | Membre | Les entrées de la corbeille : `id`, `type { slug, name }`, titre (`entryTitle`), `deletedAt`, `deletedBy` (email ou null), `purgeAt` |
| `POST /spaces/:slug/trash/:id/restore` | Membre | Restaure en brouillon ; renvoie `{ type, id }` pour le lien « Ouvrir » |
| `DELETE /spaces/:slug/trash/:id` | Super-admin | Suppression définitive (entrée et versions) |
| `DELETE /spaces/:slug/trash` | Super-admin | Vide la corbeille de l'espace |

### Dashboard

- **Historique** : un composant `HistoryPanel` (le `Sheet` de shadcn-vue, déjà installé) ouvert depuis l'en-tête de `EntryEditor`. Une version s'affiche dans l'éditeur lui-même, avec le **mode lecture seule** de la V3 (le `fieldset` désactivé des entrées programmées) et le bandeau « Version 2 · … [Restaurer cette version] [Fermer] » à la place de l'en-tête d'actions. Pas de second rendu des champs.
- **Corbeille** : une page `TrashPage`, route `espaces/:espace/contenu/corbeille`, déclarée **avant** `contenu/:type` dans le routeur. `corbeille` devient un identifiant de type réservé (`contentTypeSchema`, comme `nouveau` pour les espaces). L'écran Contenu lit `GET /trash` pour afficher le lien « Corbeille (n) ».
- **« Annuler » après une suppression** : pas de bibliothèque de notifications ; un bandeau `role="status"` en haut de la liste des entrées, avec le titre et le bouton « Annuler », jusqu'à la prochaine navigation.

## Environnements et déploiement

| Environnement | Comment |
| --- | --- |
| Local | `docker compose up db`, puis `npm run dev` (API et dashboard en parallèle, Vite qui relaie `/api`) |
| CI | GitHub Actions sur chaque PR : `npm ci`, lint, types, tests avec un service PostgreSQL, build, poids du script |
| Production | Automatique à chaque release mergée sur `main` : l'image est publiée sur GHCR, le serveur la récupère tout seul (même méthode que le portfolio) |

**Mise en ligne** : au merge sur `main` (le merge de la PR de release vaut confirmation), `deploiement.yml` relance les vérifications du CI, puis publie l'image `ghcr.io/k0konut/dashility` (paquet public) en `latest` et avec l'empreinte du commit. Sur le serveur, une tâche cron lance toutes les 5 minutes `docker compose up -d --pull always --quiet-pull` dans `/srv/docker/Projects/dashility`, ce qui ne recrée le conteneur que si l'image a changé. GitHub n'a aucun accès au serveur : pas de runner, pas de clé SSH. Retour arrière : `IMAGE_TAG=<commit>` dans le `.env` de ce dossier.

`docker/compose.prod.yml` (copié en `compose.yml` dans ce dossier) :

- `app` : l'image de l'API et du dashboard. Les migrations Drizzle s'appliquent au démarrage. En V2, le dossier des médias du NAS y est monté (`/data/medias`).
- `db` : `postgres:17`, avec un volume persistant.
- `backup` : un `pg_dump` quotidien vers le NAS (`/mnt/nas/media/backups/dashility`, monté en NFS sur le serveur), qui garde 7 sauvegardes.
- Nginx Proxy Manager, déjà en place, redirige `dashility.costamask.dev` vers `app:3000`.

**Publication du package** : `packages/client` est publié sur npm à la main (`npm publish`) quand une version change. Il est publié sous `@dashility/client`, dans l'organisation npm `dashility` du propriétaire, en accès public (`publishConfig`) ; `prepublishOnly` le reconstruit avant chaque publication.
`shortcut: publication manuelle, passer à un workflow sur tag si les versions deviennent fréquentes`

## Ordre de construction de la V1

Chaque étape correspond à une branche et à une PR vers `dev`.

1. `chore/dev/init_monorepo` : workspaces, TypeScript, ESLint, Prettier, Vitest, CI.
2. `feat/dev/base_de_donnees` : Docker Compose local, schéma Drizzle, première migration.
3. `feat/dev/authentification` : commande super-admin, login, sessions, guards.
4. `feat/dev/espaces_membres` : espaces, invitations, réinitialisations.
5. `feat/dev/collecte` : endpoint `/api/e` et package client, publié et branché sur le portfolio.
6. `feat/dev/dashboard_base` : routeur, mise en page, connexion, invitation, réinitialisation, compte.
7. `feat/dev/onglet_analytics` : agrégats, écran analytics, export CSV, SSE.
8. `feat/dev/reglages_espace` : écran des réglages et lien magique « Ne pas me compter ».
9. `chore/dev/deploiement` : Dockerfile, compose de production, sauvegarde, publication de l'image sur GHCR, README d'installation.

Faire la collecte (étape 5) avant le dashboard permet d'accumuler des données réelles le plus tôt possible.

## Risques

| Risque | Parade |
| --- | --- |
| Bloqueurs de publicité qui filtrent le script | Endpoint au nom neutre ; script bundlé dans le site, pas chargé depuis un domaine tiers |
| L'application LinkedIn n'envoie pas de provenance | Ces visites tombent dans « Accès direct » : limite connue, à signaler dans l'étude de cas |
| Le script dépasse 2 Ko | Aucune dépendance, vérification du poids en CI |
| CMS hors ligne | Les sites restent en ligne ; seuls les événements de cette période sont perdus (accepté par le PRD) |
| Perte du serveur | `pg_dump` quotidien sur le NAS |
| Mot de passe du super-admin oublié | La commande serveur permet aussi de le réinitialiser |

## Ordre de construction de la V2

Même principe : une branche et une PR vers `dev` par étape, et chaque étape laisse le dashboard utilisable.

1. `feat/dev/types_contenu` : tables, schéma Zod des champs, API et écran Structure.
2. `feat/dev/entrees` : API des entrées, écrans Contenu, liste et éditeur, avec les champs simples (texte court, choix, date, lien, liste de valeurs, nombre, oui / non, groupe répétable), la sauvegarde automatique et les écritures concurrentes.
3. `feat/dev/publication` : publier, annuler les modifications, dépublier, supprimer, contrôles de publication et EN incomplet.
4. `feat/dev/texte_riche` : Tiptap dans l'éditeur et validation côté API.
5. `feat/dev/medias` : envoi, variantes, service, nettoyage, champs image et PDF, montage du NAS dans le compose de production.
6. `feat/dev/api_publique` : clé API, `/api/v1`, HTML du texte riche, OpenAPI.
7. `feat/dev/deploiement_publication` : URL de déploiement, regroupement, état dans l'éditeur et dans Réglages.

Puis la release, et la migration du portfolio (dans son dépôt), à la demande du propriétaire.

## Ordre de construction de la V3 (publication programmée)

1. `feat/dev/programmation` : colonnes et migration, annulation dans les écritures, routes `schedule`, tâche de chaque minute, helper `parisDateTime`, puis l'éditeur (panneau « Programmer… », bandeau, lecture seule, messages d'issue), le badge, le filtre et le compteur. Une seule branche : l'API seule ne serait pas utilisable.

Puis la release, à la demande du propriétaire.

## Ordre de construction de la V3 (prévisualisation)

1. `feat/dev/previsualisation` : table `preview_links` et colonne `preview_url` (migration), routes de création et de lecture avec CORS, lecture partagée avec l'API publique, purge, puis l'éditeur (« Prévisualiser », « Copier le lien d'aperçu »), Réglages › Intégration et les extraits d'installation. Une seule branche, comme la programmation.
2. `feat/dev/collecte_apercu` : le script ne compte pas les visites d'aperçu, nouvelle version du paquet `@dashility/client`.

Puis la release, à la demande du propriétaire, et la page d'aperçu du portfolio dans son dépôt (avec la nouvelle version du paquet).

## Ordre de construction de la V3 (mise en avant)

1. `feat/dev/mise_en_avant` : colonne `featuring` (migration), `featuringSchema` et `featuredSelection` dans `packages/shared`, `FeaturingService`, routes `/api/v1/featured/:type` et `/spaces/:slug/analytics/featured`, OpenAPI, puis `FeaturingSettings` dans Structure et `FeaturedSection` dans Analytics. Une seule branche.

Puis la release, à la demande du propriétaire, le réglage de la collection Projets dans Structure, et le portfolio dans son dépôt (lecture de la sélection, build nocturne).

## Ordre de construction de la V4 (historique et corbeille)

1. `feat/dev/historique` : table `entry_versions` et migration (avec la version 1 des entrées publiées), version créée par `publish` et `publishDue`, routes des versions et de la restauration, médias cités par les versions, puis `HistoryPanel` et la lecture seule d'une version dans l'éditeur.
2. `feat/dev/corbeille` : colonnes `deleted_at` et `deleted_by`, helper `alive` sur toutes les lectures, suppression devenue mise à la corbeille, routes de la corbeille, purge à 30 jours, identifiant `corbeille` réservé, puis `TrashPage`, le lien dans Contenu et le bandeau « Annuler ».

Deux branches : chacune est utilisable seule. Puis la release, à la demande du propriétaire.
