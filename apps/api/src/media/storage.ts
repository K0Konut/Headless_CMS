import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Dossier des médias : le NAS en production (`/data/medias`, monté par le compose), un
 *  dossier local ignoré par Git en développement. Lu à chaque appel : les tests le changent. */
export const mediaDir = () =>
  process.env.MEDIA_DIR ?? fileURLToPath(new URL('../../data/medias', import.meta.url))

/** Dossier d'un média : un dossier par fichier, rangé par espace. Les deux identifiants sont
 *  des UUID générés par l'API : le nom envoyé n'entre jamais dans un chemin. */
export const mediaPath = (spaceId: string, id: string, file?: string) =>
  join(mediaDir(), spaceId, id, ...(file ? [file] : []))

/** Supprime les fichiers d'un espace supprimé. Sans effet si le stockage est injoignable : les
 *  fichiers restent, sans plus être servis (leur description a disparu de la base). */
export async function removeSpaceMedia(spaceId: string) {
  await rm(join(mediaDir(), spaceId), { recursive: true, force: true }).catch(() => undefined)
}
