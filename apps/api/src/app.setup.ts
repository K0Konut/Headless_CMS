import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import { SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { openApiDocument } from './public-api/openapi.js'

/** Configuration commune au serveur et aux tests. */
export function setupApp(app: NestExpressApplication) {
  app.setGlobalPrefix('api')
  // Derrière Nginx Proxy Manager : l'IP du client vient de X-Forwarded-For.
  app.set('trust proxy', 'loopback, uniquelocal')
  // Images https : le dashboard affiche le favicon de chaque site (`<site>/favicon.ico`).
  app.use(
    helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'https:'] } } }),
  )
  app.use(cookieParser())
  // Corps de la collecte : JSON envoyé en text/plain, quelques centaines d'octets au plus.
  app.useBodyParser('text', { limit: '2kb' })
  // Une entrée avec un long texte riche dépasse les 100 Ko par défaut (le JSON de Tiptap est
  // verbeux). Les envois de fichiers passent par multer, avec leur propre limite.
  app.useBodyParser('json', { limit: '1mb' })
  // Documentation de l'API de lecture des sites : /api/docs (et /api/docs-json).
  SwaggerModule.setup('api/docs', app, openApiDocument)
  return app
}
