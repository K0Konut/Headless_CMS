import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'

/** Configuration commune au serveur et aux tests. */
export function setupApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api')
  // Derrière Nginx Proxy Manager : l'IP du client vient de X-Forwarded-For.
  app.set('trust proxy', 'loopback, uniquelocal')
  app.use(helmet())
  app.use(cookieParser())
  // Corps de la collecte : JSON envoyé en text/plain, quelques centaines d'octets au plus.
  app.useBodyParser('text', { limit: '2kb' })
  return app
}
