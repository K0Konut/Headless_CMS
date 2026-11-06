import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { NextFunction, Request, Response } from 'express'
import { fileURLToPath } from 'node:url'
import { AppModule } from './app.module.js'
import { setupApp } from './app.setup.js'
import { createDb } from './db/index.js'

const migrationDb = createDb()
await migrate(migrationDb, {
  migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
})
await migrationDb.$client.end()

const app = setupApp(await NestFactory.create<NestExpressApplication>(AppModule))
app.enableShutdownHooks()

// En production, l'API sert aussi le dashboard compilé : même origine, pas de CORS (architecture technique).
const dashboard = fileURLToPath(new URL('../../dashboard/dist', import.meta.url))
// Noms de fichiers à empreinte : jamais modifiés, donc gardés un an par le navigateur.
app.useStaticAssets(`${dashboard}/assets`, { prefix: '/assets', immutable: true, maxAge: '1y' })
app.useStaticAssets(dashboard)
// Routes du dashboard (/connexion, /espaces/…) : le routeur Vue les résout à partir d'index.html.
app.use((req: Request, res: Response, next: NextFunction) =>
  req.method === 'GET' && !req.path.startsWith('/api')
    ? res.sendFile(`${dashboard}/index.html`)
    : next(),
)

await app.listen(process.env.PORT ?? 3000)
