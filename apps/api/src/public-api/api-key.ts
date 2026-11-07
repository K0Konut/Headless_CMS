import { createHash, randomBytes } from 'node:crypto'

/** Clé de l'API de lecture : 32 octets aléatoires, préfixés par `dly_` pour être reconnue si
 *  elle se retrouve dans un dépôt de code par erreur (architecture, « API publique »). */
export const generateApiKey = () => `dly_${randomBytes(32).toString('base64url')}`

/** Seule l'empreinte est gardée en base, comme pour les sessions. */
export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex')
