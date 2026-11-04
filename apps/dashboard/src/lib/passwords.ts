import { passwordSchema } from '@cms/shared'

/** Erreur à afficher pour un nouveau mot de passe, ou chaîne vide s'il convient. */
export function newPasswordError(password: string, confirmation: string) {
  const result = passwordSchema.safeParse(password)
  if (!result.success) return result.error.issues[0]?.message ?? 'Mot de passe invalide'
  if (password !== confirmation) return 'Les deux mots de passe ne correspondent pas'
  return ''
}
