# Journal des décisions

| Date | Décision | Raison |
| --- | --- | --- |
| 2026-11-04 | Branches de travail nommées `<type>/<cible>/<action>` | Alignement sur le workflow Git commun à tous les projets |
| 2026-11-04 | Ordre des versions : V1 analytics, V2 contenu, V3 confort | Le portfolio collecte des stats pendant le développement du contenu ; la mise en avant (V3) disposera de données |
| 2026-11-04 | Méthode allégée : PRD, architecture et UX, wireframes, code (pas de marque ni de DA) | Dashboard neutre construit avec shadcn-vue, pas d'identité visuelle à défendre |
| 2026-11-04 | API en NestJS | Cadre reconnu par les recruteurs, guards pour l'isolation des espaces, OpenAPI via @nestjs/swagger |
| 2026-11-04 | ORM : Drizzle | Agrégations analytics proches du SQL, JSONB typé, schémas partagés via drizzle-zod |
| 2026-11-04 | Mise en avant tirée au build, avec un rebuild nocturne | Site pré-rendu indépendant du CMS ; classement rafraîchi chaque jour |
| 2026-11-04 | Seuil de classement : 20 vues, revu avec les données V1 | Trafic de portfolio faible ; on ajustera sur données réelles |
| 2026-11-04 | Non-objectifs et cibles chiffrées validés tels quels | Périmètre déjà serré, cibles mesurables pour l'étude de cas |
| 2026-11-04 | Pas d'email en V1 : liens d'invitation et de réinitialisation transmis à la main | Cohérent avec le non-objectif « pas d'envoi d'emails en V1 » |
| 2026-11-04 | Nom du CMS reporté avant la publication du dépôt | Ne bloque rien ; nom de code « cms » d'ici là |
| 2026-11-04 | Autres types de contenu du portfolio reportés à la phase architecture et UX | Prévu ainsi par le PRD |
| 2026-11-04 | Un membre peut appartenir à plusieurs espaces, avec un sélecteur d'espace | Même composant que pour le super-admin, sans coût supplémentaire |
| 2026-11-04 | Après connexion : dernier espace ouvert, sur son analytics | Pas d'écran de vue d'ensemble à construire en V1 |
| 2026-11-04 | « Ne pas me compter » par lien magique `?cms-ignore=1` ouvert depuis le dashboard | Le dashboard ne peut pas écrire dans le stockage d'un autre domaine |
| 2026-11-04 | Onglet analytics complet : tuiles, courbe, pages, provenances, temps réel en événements | Le temps réel compte des événements, pas des visiteurs, faute d'identifiant |
| 2026-11-04 | Wireframes détaillés pour la V1 seulement ; ceux de la V2 au début de la V2 | Les besoins V2 seront plus clairs avec la V1 en main |
| 2026-11-04 | Types de contenu du portfolio autres que « Projet » reportés à nouveau, au début de la V2 | Ils dépendent du constructeur de types, conçu en V2 |
| 2026-11-04 | Interface du dashboard en français uniquement | Seul le contenu géré est bilingue |
| 2026-11-04 | Double authentification TOTP sortie de la V1, prévue dans une version ultérieure | Choix de l'utilisateur : V1 recentrée sur l'analytics |
| 2026-11-04 | Sessions par cookie httpOnly stockées en base, dashboard et API sur la même origine | Révocation immédiate, pas de jeton lisible en JS, pas de CORS |
| 2026-11-04 | Script analytics distribué en package npm public (`packages/client`) | Bundlé dans le site, il fonctionne même si le CMS est hors ligne ; le même package servira au contenu en V2 |
| 2026-11-04 | Un seul conteneur applicatif : NestJS sert l'API et le dashboard compilé | Même origine sans configuration de proxy supplémentaire |
| 2026-11-04 | Code, base et routes de l'API en anglais ; interface, URLs du dashboard et commits en français | Usage courant pour un dépôt public |
| 2026-11-04 | Zod dans `packages/shared`, Vitest partout, Playwright pour le dashboard | Un seul outil de validation et un seul lanceur de tests sur tout le monorepo |
| 2026-11-04 | Endpoint de collecte nommé `/api/e`, envoi par `sendBeacon` en `text/plain` | Évite les filtres des bloqueurs et la requête CORS préalable |
| 2026-11-04 | Super-admin créé par une commande serveur | Aucun mot de passe dans les variables d'environnement |
| 2026-11-04 | Collecte construite avant le dashboard dans l'ordre de la V1 | Accumuler des données réelles le plus tôt possible |
| 2026-11-04 | TypeScript fixé sur la 6.0, pas la 7 | typescript-eslint ne supporte pas encore TypeScript 7 (`<6.1`) ; à revoir quand il le supportera |
| 2026-11-04 | `docs/` exclu de Prettier | Prettier aligne les tableaux Markdown, ce qui rend les documents illisibles en brut et gonfle les diffs |
| 2026-11-04 | API en modules ES (`"type": "module"`) | NestJS 12 est publié en ESM ; le reste du monorepo l'est déjà |
| 2026-11-04 | Pilote PostgreSQL : `pg` (node-postgres) | Le plus répandu, pris en charge nativement par Drizzle |
| 2026-11-04 | Contraintes en base : email en minuscules, invitation liée à un espace, réinitialisation liée à un utilisateur | Une erreur de l'API ne peut pas écrire de données incohérentes |
| 2026-11-04 | Mot de passe : 12 caractères minimum, 128 maximum | Le PRD ne fixait rien ; le plafond évite qu'un mot de passe géant rende le hachage Argon2 coûteux |
| 2026-11-04 | API compilée par le builder SWC de NestJS ; `packages/shared` reste en TypeScript source, lu directement par Node (22.18 minimum) | Pas d'étape de build pour `shared` ; `tsc --noEmit` garde la vérification des types |
| 2026-11-04 | Tests de l'API sur une base séparée `cms_test`, créée et migrée automatiquement | Les tests vident leurs tables sans toucher aux données de développement |
| 2026-11-04 | La commande super-admin crée le compte ou réinitialise son mot de passe, et ferme ses sessions | Une seule commande couvre aussi le risque « mot de passe du super-admin oublié » |
| 2026-11-04 | Documentation OpenAPI (`@nestjs/swagger`) reportée | Les schémas sont en Zod ; la brancher demande un adaptateur, à faire quand l'API sera plus fournie |
| 2026-11-04 | Slug d'espace : minuscules, chiffres et tirets, 50 caractères maximum, `nouveau` réservé | Le slug apparaît dans les URLs du dashboard, où `/espaces/nouveau` est l'écran de création |
| 2026-11-04 | URL du site stockée réduite à son origine (`https://domaine`) | La collecte compare cette valeur à l'en-tête `Origin` |
| 2026-11-04 | Invitation refusée (409) si l'email a obtenu un compte entre-temps | Accepter le lien écraserait le mot de passe d'un compte existant |
| 2026-11-04 | Une nouvelle invitation ou réinitialisation remplace le lien encore valide pour le même email ou compte | Un seul lien actif à la fois, la liste des invitations reste lisible |
| 2026-11-04 | Action réservée au super-admin sur un espace accessible : 403 ; espace inaccessible : 404 | Le membre connaît déjà l'espace, rien n'est révélé ; le 404 reste réservé aux espaces cachés |
| 2026-11-04 | Package client nommé `@cms/client` et marqué privé tant que le nom du CMS n'est pas choisi | Évite une publication npm sous un nom provisoire |
| 2026-11-04 | Le client n'importe pas `@cms/shared` et recopie la forme de l'événement | Zod ferait dépasser le budget de 2 Ko ; le serveur reste seul juge de la validité |
| 2026-11-04 | Pas d'en-têtes CORS sur `/api/e` | `sendBeacon` en `text/plain` est une requête simple qui n'en a pas besoin ; la sécurité repose sur la comparaison `Origin` / URL du site |
| 2026-11-04 | `/api/e` répond toujours 204, sauf au-delà de 60 événements par minute (429) | Un site ne peut pas sonder les clés ou les origines acceptées |
| 2026-11-04 | Dashboard : thème neutre shadcn-vue (zinc), police Public Sans auto-hébergée, un seul accent bleu encre pour le focus et l'élément actif | Dashboard sans DA (méthode allégée) ; la CSP n'autorise que l'origine du CMS, d'où une police servie localement |
| 2026-11-04 | `PUT /auth/password` renvoie 400, et non 401, pour un mot de passe actuel incorrect | Le dashboard traite tout 401 comme une session expirée et renverrait à la connexion |
| 2026-11-04 | Client API dans `src/lib/api.ts` (fonction `api`) plutôt qu'un composable `useApi` | Aucun état réactif à porter : une fonction suffit |
| 2026-11-04 | Tests de bout en bout Playwright sur une base `cms_e2e` et des ports dédiés (3100, 5174), en CI | Ils ne touchent ni au serveur de dev ni aux données des autres tests |
| 2026-11-04 | Recherche dans le sélecteur d'espace (plus de 5 espaces) reportée | Inutile avec deux ou trois espaces |
| 2026-11-04 | Graphiques en barres dessinés à la main plutôt qu'avec Unovis | Unovis embarque d3, three.js, Leaflet et MapLibre (~10 Mo) pour deux graphiques en barres |
| 2026-11-04 | Vues et CV par jour en deux petits graphiques empilés, pas un graphique à deux axes | Échelles trop différentes (dizaines contre unités) ; couleurs validées pour les daltoniens et le contraste |
| 2026-11-04 | Flux temps réel : un état initial (`snapshot`) puis chaque événement, battement toutes les 30 s | La reconnexion automatique d'EventSource resynchronise sans requête à part ; le battement traverse le proxy |
| 2026-11-04 | Agrégats rechargés après un événement en direct, au plus toutes les 2 s, si la période inclut aujourd'hui | Tuiles cohérentes avec le temps réel, sans une requête par événement |
| 2026-11-04 | Période dans l'URL (`?periode=7j\|30j\|6m` ou `?du=&au=`), 200 jours au plus | Lien partageable ; la rétention est de 6 mois |
| 2026-11-04 | Export CSV : dates ISO UTC, type brut (`view`, `cv`), BOM UTF-8 | Données brutes réutilisables ; le BOM fait ouvrir le fichier en UTF-8 par Excel |
| 2026-11-04 | Espace inaccessible : « Page introuvable » décidée par le garde du routeur, plus par la mise en page | La session peut changer en pleine navigation (renommage, suppression) ; une décision réactive démontait l'écran affiché |
| 2026-11-04 | Retrait d'un membre confirmé par la boîte de dialogue native ; suppression d'un espace confirmée en retapant son nom | Le retrait se répare par une nouvelle invitation ; la suppression est définitive (document UX) |
| 2026-11-04 | Boutons « Copier » nommés d'après ce qu'ils copient (« Copier : Identifiant public ») | Plusieurs boutons sur une même page ; le nom commence par le texte visible (WCAG 2.5.3) |
| 2026-11-04 | Test de bout en bout qui vérifie l'absence de défilement horizontal à 390 px | Un débordement des réglages sur mobile n'avait été vu qu'à la capture d'écran |
| 2026-11-04 | Nom du CMS : **Dashility** ; packages `@dashility/*`, cookie `dashility_session`, marqueur et paramètre `dashility-ignore`, attribut `data-dashility-cv` | *Dash* (dashboard) + *-ility* (visibility, agility) ; libre sur npm et GitHub ; Dashy écarté pour éviter la confusion avec le projet auto-hébergé du même nom |
| 2026-11-06 | Mise en ligne automatique à chaque release sur `main`, comme le portfolio : image publiée sur GHCR (paquet public), récupérée par une tâche cron du serveur toutes les 5 minutes (au lieu d'un `git pull` et d'un build à la main sur le serveur) | Le serveur est en service et ce modèle y tourne déjà. Rien à compiler sur le serveur ; GitHub n'a aucun accès au serveur. Paquet public : le serveur le récupère sans jeton, et l'image ne contient aucun secret |
| 2026-11-06 | Domaine `dashility.costamask.dev` ; sauvegardes dans `/mnt/nas/media/backups/dashility` (NAS monté en NFS sur le serveur) | Réponses du propriétaire |
| 2026-11-06 | V2 : sur une entrée publiée, les modifications sont gardées à part jusqu'à « Publier les modifications » | Choix du propriétaire : la sauvegarde automatique ne doit jamais mettre en ligne un texte à moitié écrit |
| 2026-11-06 | V2 : texte riche saisi dans un éditeur visuel limité (gras, italique, lien, listes, intertitre, mise en avant) | Choix du propriétaire : utilisable par un membre qui ne connaît pas Markdown |
| 2026-11-06 | V2 : pas de médiathèque, une image s'envoie dans son champ avec ses textes alternatifs FR et EN | Choix du propriétaire : un écran et des règles de moins (image partagée, suppression) |
| 2026-11-06 | V2 : l'écran « Fichiers » est remplacé par un type de champ « Fichier PDF » ; le CV devient une page unique « CV » | Un écran de moins, et un espace sans CV (un client) n'a pas d'écran inutile ; écart avec le document UX v1, proposé à la relecture |
| 2026-11-06 | V2 : deux types de champs s'ajoutent à la liste du PRD, « Oui / non » et « Fichier PDF » | « À la une » du portfolio et le CV |
| 2026-11-06 | V2 : un champ garde son identifiant, son type et son caractère traduisible après sa création ; un type garde son identifiant et sa nature | Les entrées et les sites en dépendent ; on supprime et on recrée pour les changer |
| 2026-11-06 | Compétences du portfolio : la mise en avant des technos utilisées par le site reste dans son code | Elle décrit le code du site, pas son contenu ; évite un groupe dans un groupe |
