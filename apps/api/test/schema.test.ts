import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '../src/db/schema.js'
import { createDb } from '../src/db/index.js'

const db = createDb()
const { users, spaces, memberships, tokens, events } = schema

class Rollback extends Error {}

/** Exécute `fn` dans une transaction annulée à la fin : la base reste vide de données de test. */
async function inRollback(
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>,
) {
  await expect(
    db.transaction(async (tx) => {
      await fn(tx)
      throw new Rollback()
    }),
  ).rejects.toBeInstanceOf(Rollback)
}

beforeAll(() => db.execute(sql`truncate users, spaces cascade`))
afterAll(() => db.$client.end())

describe('schéma V1', () => {
  it('supprime en cascade membres, invitations et événements avec leur espace', async () => {
    await inRollback(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: 'a@b.fr', passwordHash: 'x' })
        .returning()
      const [space] = await tx
        .insert(spaces)
        .values({ slug: 'portfolio', name: 'Portfolio', siteUrl: 'https://a.fr', publicKey: 'pk' })
        .returning()
      await tx.insert(memberships).values({ userId: user!.id, spaceId: space!.id })
      await tx.insert(tokens).values({
        id: 'h',
        kind: 'invitation',
        email: 'c@d.fr',
        spaceId: space!.id,
        expiresAt: new Date(),
      })
      await tx.insert(events).values({ spaceId: space!.id, kind: 'view', path: '/' })

      await tx.delete(spaces).where(eq(spaces.id, space!.id))

      expect(await tx.select().from(memberships)).toHaveLength(0)
      expect(await tx.select().from(tokens)).toHaveLength(0)
      expect(await tx.select().from(events)).toHaveLength(0)
      expect(await tx.select().from(users)).toHaveLength(1)
    })
  })

  it('refuse un email avec des majuscules', async () => {
    await inRollback(async (tx) => {
      await expect(
        tx.insert(users).values({ email: 'A@b.fr', passwordHash: 'x' }),
      ).rejects.toThrow()
    })
  })

  it('refuse une invitation sans espace', async () => {
    await inRollback(async (tx) => {
      await expect(
        tx
          .insert(tokens)
          .values({ id: 'h', kind: 'invitation', email: 'c@d.fr', expiresAt: new Date() }),
      ).rejects.toThrow()
    })
  })
})
