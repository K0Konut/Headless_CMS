import argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { sessions, users } from '../db/schema.js'

/** Crée le super-admin, ou réinitialise son mot de passe s'il existe déjà, et ferme ses sessions. */
export async function upsertSuperAdmin(db: Db, email: string, password: string) {
  const passwordHash = await argon2.hash(password)
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, isSuperAdmin: true })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash, isSuperAdmin: true } })
    .returning()
  await db.delete(sessions).where(eq(sessions.userId, user!.id))
  return user!
}
