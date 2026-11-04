import { UnsupportedMediaTypeException } from '@nestjs/common'
import type { NextFunction, Request } from 'express'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Protection CSRF, en plus de SameSite=Strict : une requête qui modifie des données doit être en JSON. */
export function requireJson(req: Request, _res: unknown, next: NextFunction) {
  if (
    SAFE_METHODS.has(req.method) ||
    req.headers['content-type']?.toLowerCase().startsWith('application/json')
  ) {
    return next()
  }
  throw new UnsupportedMediaTypeException('Content-Type: application/json requis')
}
