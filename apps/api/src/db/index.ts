import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'
import { databaseUrl } from './url.js'

export const createDb = (url = databaseUrl) => drizzle(url, { schema })
export type Db = ReturnType<typeof createDb>
/** Une transaction ouverte par `db.transaction`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type User = typeof schema.users.$inferSelect
