/** Violation de contrainte d'unicité PostgreSQL ; Drizzle range l'erreur du pilote dans `cause`. */
export function isUniqueViolation(err: unknown) {
  const code = (e: unknown) => (e as { code?: string } | undefined)?.code
  return code(err) === '23505' || code((err as { cause?: unknown })?.cause) === '23505'
}
