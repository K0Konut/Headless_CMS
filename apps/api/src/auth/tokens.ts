import { createHash, randomBytes } from 'node:crypto'

/** Jeton aléatoire de 32 octets, transmis au client (cookie de session, lien à usage unique). */
export const newToken = () => randomBytes(32).toString('base64url')

/** Seule l'empreinte du jeton est stockée : une fuite de la base ne donne aucun jeton utilisable. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
