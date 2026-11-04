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
