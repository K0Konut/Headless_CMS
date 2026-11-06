import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { NextFunction, Request, Response } from 'express'
import { fileURLToPath } from 'node:url'
import { AppModule } from './app.module.js'
import { setupApp } from './app.setup.js'

const app = setupApp(await NestFactory.create<NestExpressApplication>(AppModule))
app.enableShutdownHooks()

// En production, l'API sert aussi le dashboard compilé : même origine, pas de CORS (architecture technique).
const dashboard = fileURLToPath(new URL('../../dashboard/dist', import.meta.url))
// Noms de fichiers à empreinte : jamais modifiés, donc gardés un an par le navigateur.
// fallthrough: false : un ancien fichier disparu après une mise en ligne répond 404, pas index.html.
app.useStaticAssets(`${dashboard}/assets`, {
  prefix: '/assets',
  immutable: true,
  maxAge: '1y',
  fallthrough: false,
})
app.useStaticAssets(dashboard)
// Routes du dashboard (/connexion, /espaces/…) : le routeur Vue les résout à partir d'index.html.
app.use((req: Request, res: Response, next: NextFunction) =>
  req.method === 'GET' && !/^\/api(\/|$)/.test(req.path) && req.accepts('html')
    ? res.sendFile(`${dashboard}/index.html`)
    : next(),
)

await app.listen(process.env.PORT ?? 3000)
