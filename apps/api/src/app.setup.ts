import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Configuration commune au serveur et aux tests. */
export function setupApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api')
  // Derrière Nginx Proxy Manager : l'IP du client vient de X-Forwarded-For.
  app.set('trust proxy', 'loopback, uniquelocal')
  app.use(helmet())
  app.use(cookieParser())
  // Protection CSRF, en plus de SameSite=Strict : une requête qui modifie des données doit être en JSON.
  app.use((req: import('express').Request, res: import('express').Response, next: () => void) => {
    if (SAFE_METHODS.has(req.method) || req.headers['content-type']?.startsWith('application/json'))
      return next()
    res.status(415).json({
      error: { code: 'unsupported_media_type', message: 'Content-Type: application/json requis' },
    })
  })
  return app
}
