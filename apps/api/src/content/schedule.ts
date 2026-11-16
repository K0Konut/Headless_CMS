import { sql } from 'drizzle-orm'
import { entries } from '../db/schema.js'

/** Message d'un identifiant d'URL déjà pris, à l'enregistrement comme à la publication. */
export const SLUG_TAKEN = 'Cet identifiant d’URL est déjà utilisé par une autre entrée'

/** Identifiant gardé par une entrée de la corbeille (document UX, « Supprimer »). */
export const SLUG_IN_TRASH = 'Cet identifiant est pris par une entrée de la corbeille'

/** Champs d'une écriture qui change la version d'une entrée. Le changement de version porte
 *  l'annulation de la programmation (architecture, « Ce qui annule une programmation ») : aucune
 *  écriture ne peut l'oublier, et la version programmée est toujours la version actuelle.
 *  Avec `notice`, une programmation en cours laisse le message « annulée » à l'éditeur ; dans
 *  tous les cas, l'issue précédente est effacée (elle ne reste que jusqu'à la prochaine écriture). */
export const nextVersion = (notice = true) => ({
  version: sql`${entries.version} + 1`,
  scheduledAt: null,
  lastSchedule: notice
    ? sql`case when ${entries.scheduledAt} is not null then jsonb_build_object('plannedAt', ${entries.scheduledAt}, 'outcome', 'cancelled', 'at', now()) end`
    : null,
})
