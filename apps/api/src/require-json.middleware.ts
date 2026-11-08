import { UnsupportedMediaTypeException } from '@nestjs/common'
import type { NextFunction, Request } from 'express'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Protection CSRF, en plus de SameSite=Strict : une requête qui modifie des données doit être en
 *  JSON. Un envoi de fichier (multipart) porte à la place l'en-tête `X-Requested-With`, qu'un
 *  autre site ne peut pas poser sans requête préalable CORS. */
export function requireJson(req: Request, _res: unknown, next: NextFunction) {
  const type = req.headers['content-type']?.toLowerCase() ?? ''
  if (SAFE_METHODS.has(req.method) || type.startsWith('application/json')) return next()
  if (type.startsWith('multipart/form-data')) {
    if (req.headers['x-requested-with'] === 'dashility') return next()
    throw new UnsupportedMediaTypeException('En-tête X-Requested-With: dashility requis')
  }
  throw new UnsupportedMediaTypeException('Content-Type: application/json requis')
}
