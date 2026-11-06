/** Applique les migrations Drizzle ; lancé par le conteneur de production avant l'API (docker/Dockerfile). */
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { createDb } from './db/index.js'

const db = createDb()
await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) })
await db.$client.end()
console.log('Migrations appliquées')
