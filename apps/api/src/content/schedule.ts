import { sql } from 'drizzle-orm'
import { entries } from '../db/schema.js'

/** À joindre à toute écriture qui change la version d'une entrée : elle retire la programmation
 *  (architecture, « Ce qui annule une programmation »). Avec `notice`, une programmation en
 *  cours laisse le message « annulée » à l'éditeur ; dans tous les cas, l'issue précédente est
 *  effacée (elle ne reste que jusqu'à la prochaine écriture). */
export const clearSchedule = (notice: boolean) => ({
  scheduledAt: null,
  scheduledVersion: null,
  lastSchedule: notice
    ? sql`case when ${entries.scheduledAt} is not null then jsonb_build_object('plannedAt', ${entries.scheduledAt}, 'outcome', 'cancelled', 'at', now()) end`
    : null,
})
