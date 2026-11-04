import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

/** Crée la base de test si besoin, puis lui applique les migrations. */
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL!)
  const name = url.pathname.slice(1)

  const admin = new pg.Client({ connectionString: url.href.replace(url.pathname, '/postgres') })
  await admin.connect()
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name])
  if (!rowCount) await admin.query(`create database "${name}"`)
  await admin.end()

  const db = drizzle(url.href)
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })
  await db.$client.end()
}
