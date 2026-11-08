import { newToken } from '../auth/tokens.js'

/** Clé de l'API de lecture : un jeton de 32 octets, préfixé par `dly_` pour être reconnu s'il
 *  se retrouve dans un dépôt de code par erreur (architecture, « API publique »). Comme pour les
 *  sessions, seule son empreinte (`hashToken`) est gardée en base. */
export const generateApiKey = () => `dly_${newToken()}`
