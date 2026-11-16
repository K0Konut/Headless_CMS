# Direction visuelle — dashboard de Dashility

11 novembre 2026 · s'appuie sur `04-architecture-contenu-ux.md` (refonte de Contenu et Structure) et `decisions.md`

Le dashboard n'avait pas de direction visuelle : un thème neutre shadcn-vue (zinc), un seul accent. Le propriétaire l'a trouvé terne, trop vide et trop large. Ce document fixe une direction légère : c'est un outil, il doit rester calme, mais il doit dire d'un coup d'œil ce qui est à faire.

Maquette statique : `06-maquettes/refonte-dashboard.html`, avec ses captures (`contenu.png`, `structure.png`, `type.png`, `ajout.png`).

## Intention

**La couleur porte l'état du contenu.** Tout le reste est neutre. Un écran sans rien à faire est gris et blanc ; un brouillon, une traduction manquante ou une publication programmée se voient avant d'être lus.

- Le seul élément appuyé est le bloc « À traiter » de Contenu : chaque ligne porte un liseré de la couleur de son statut le plus pressant.
- L'accent bleu encre ne sert qu'à agir et à se repérer : action principale, entrée active de la navigation, liens, focus, onglet actif.
- Pas d'ombre, pas de dégradé, pas d'animation décorative.

## Couleurs

| Rôle | Couleur | Fond teinté | Contraste du texte |
| --- | --- | --- | --- |
| Texte | `#18181B` | — | — |
| Texte secondaire (dates, libellés, compteurs) | `#62626C` | sur blanc / sur le fond | 6,0 / 5,5 |
| Fond de l'écran | `#F4F5F7` | — | — |
| Surfaces (barre latérale, panneaux, champs) | `#FFFFFF` | — | — |
| Bordures | `#E4E4E7` | — | — |
| Accent : actions, navigation active, focus | `#2741B8` | `#E6ECFC` | 8,3 sur blanc |

**Statuts.** Le texte du badge est la couleur, le fond est sa teinte ; une pastille ronde devant le texte. La couleur n'est jamais seule : le mot est toujours écrit.

| Statut | Texte | Fond | Contraste | Pourquoi cette couleur |
| --- | --- | --- | --- | --- |
| Publié | `#17663F` | `#E3F3EA` | 6,1 | En ligne, rien à faire |
| Brouillon | `#4B4B55` | `#EDEDF0` | 7,4 | Pas encore une alerte : il n'existe que dans le dashboard |
| Modifications non publiées | `#8A4B00` | `#FCEFD8` | 6,0 | Le site montre une ancienne version |
| EN incomplet | `#5B32A8` | `#EEE8FA` | 7,1 | Propre à la langue, distinct des autres alertes |
| Programmé | `#2741B8` | `#E6ECFC` | 7,0 | Une action prévue : la couleur de l'accent |
| Erreur, suppression | `destructive` actuel | — | — | Inchangé |

Ordre de priorité pour le liseré d'« À traiter » : modifications non publiées, brouillon, EN incomplet, programmé.

Contrastes calculés selon WCAG 2.1 : tous au-dessus de 4,5 (AA pour le texte courant).

## Typographie

- **Public Sans**, déjà auto-hébergée (la CSP n'autorise pas les polices externes). Une seule famille ; la hiérarchie vient de la taille et de la graisse.
- Chiffres tabulaires partout (`font-variant-numeric: tabular-nums`) : compteurs et dates s'alignent en colonne.
- Échelle :

| Usage | Taille | Graisse |
| --- | --- | --- |
| Titre d'écran | 24 px | 650 |
| Titre de section (« À traiter », « Collections ») | 15 px | 650 |
| Nom dans une ligne (type, entrée, champ) | 14 px | 600 |
| Texte courant | 14 px | 400 |
| Dates, libellés de champ, badges | 12,5 à 13 px | 400 à 550 |

- Pas de capitales pour les libellés, pas de surtitre au-dessus des titres. Le compteur d'une section est une pastille sombre à côté de son titre.

## Icônes

Lucide, déjà utilisé. 16 px, trait de 2 px, couleur du texte secondaire.

**Nature d'un type** : collection `library`, page unique `file`. Devant chaque ligne de Contenu et de Structure.

**Type de champ**, dans une tuile de 30 px sur le fond de l'écran, devant chaque champ de Structure et dans la grille d'ajout :

| Champ | Icône |
| --- | --- |
| Texte court | `type` |
| Texte riche | `pilcrow` |
| Liste de choix | `circle-dot` |
| Date ou période | `calendar-range` |
| Lien | `link` |
| Liste de valeurs | `tags` |
| Nombre | `hash` |
| Oui / non | `toggle-right` |
| Image | `image` |
| Fichier PDF | `file-type` |
| Relation (V4) | `waypoints` |
| Groupe répétable | `rows-3` |

## Surfaces et densité

- **Fond gris clair, panneaux blancs.** Les listes vivent dans un panneau blanc bordé ; chaque élément est une ligne séparée par un filet. Les cartes séparées ne servent qu'aux blocs composites (indicateurs de l'analytics, grille d'ajout d'un champ).
- **Lignes de 44 px environ** (11 px de marge verticale), survol en `#F7F7F9`. Une ligne entière est cliquable ; ses boutons gardent leur propre action.
- **Rayons par niveau** : panneau 10 px, bouton et champ 8 px, badge 6 px. Pas d'ombre.
- **Largeur** : le contenu garde sa largeur maximale (1 000 px environ), remplie par les lignes. Marges de 40 px sur ordinateur, 16 px sur mobile.
- **Barre latérale blanche**, bordée à droite. Les types sous « Contenu » sont indentés avec un filet vertical ; le type ouvert a le fond teinté de l'accent.

## Mouvement

Seulement en réponse à une action : déplier un champ ou un élément (chevron qui pivote, 150 ms, `ease-out`), changer d'onglet (aucun). Avec `prefers-reduced-motion`, aucune transition. Rien ne bouge au chargement.

## Hors périmètre

- Thème sombre : le dashboard n'en a pas, ce n'est pas demandé.
- Graphiques de l'analytics : leurs couleurs (`chart-1` à `chart-5`) ne changent pas.

## Mise en œuvre

Les couleurs deviennent des variables CSS dans `apps/dashboard/src/style.css` (`--status-published`, `--status-published-tint`, etc.) et des couleurs Tailwind ; `--primary` et `--sidebar-primary` passent au bleu encre, `--background` au gris de fond. Le composant `StatusBadges` reçoit les variantes de statut ; une table des icônes de champs rejoint `FIELD_TYPE_LABELS` dans `lib/content.ts`.
