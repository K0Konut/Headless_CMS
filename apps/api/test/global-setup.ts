import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

/** Crée la base si besoin, lui applique les migrations et la vide. Sert aux tests de l'API et
 *  aux tests de bout en bout du dashboard. */
export async function prepareDatabase(databaseUrl: string) {
  const url = new URL(databaseUrl)
  const name = url.pathname.slice(1)
  // Cette fonction vide la base : jamais sur une base qui n'est pas explicitement de test.
  if (!/_(test|e2e)$/.test(name)) {
    throw new Error(`Base « ${name} » refusée : son nom doit finir par _test ou _e2e`)
  }

  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const admin = new pg.Client({ connectionString: adminUrl.href })
  await admin.connect()
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name])
  if (!rowCount) await admin.query(`create database "${name}"`)
  await admin.end()

  const db = drizzle(url.href)
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })
  await db.execute(sql`truncate users, spaces cascade`)
  await db.$client.end()
}

export default function setup() {
  return prepareDatabase(process.env.DATABASE_URL!)
}
