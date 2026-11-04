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
