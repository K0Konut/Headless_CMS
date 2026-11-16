/** Violation de contrainte d'unicité PostgreSQL, sur `constraint` si elle est donnée ; Drizzle
 *  range l'erreur du pilote dans `cause`. */
export function isUniqueViolation(err: unknown, constraint?: string) {
  const pg = [err, (err as { cause?: unknown })?.cause].find(
    (e) => (e as { code?: string } | undefined)?.code === '23505',
  ) as { constraint?: string } | undefined
  return !!pg && (!constraint || pg.constraint === constraint)
}
