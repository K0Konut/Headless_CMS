import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, afterEach, beforeEach } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { setupApp } from '../src/app.setup.js'
import { createDb } from '../src/db/index.js'

export const db = createDb()
export const PASSWORD = 'motdepasse-solide'

/** Application neuve et base vide avant chaque test : les compteurs de limitation de débit
 *  repartent aussi à zéro. */
export function useTestApp() {
  const ctx = {} as { app: NestExpressApplication }
  beforeEach(async () => {
    await db.execute(sql`truncate users, spaces cascade`)
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    ctx.app = setupApp(moduleRef.createNestApplication<NestExpressApplication>())
    await ctx.app.init()
  })
  afterEach(() => ctx.app.close())
  afterAll(() => db.$client.end())
  return ctx
}

/** Cookie de session posé par une réponse, prêt à renvoyer. Le cookie est `Secure` : un client
 *  HTTP de test ne le renverrait pas de lui-même. */
export const sessionCookie = (res: request.Response) =>
  [res.headers['set-cookie']]
    .flat()
    .find((c) => c?.startsWith('dashility_session='))!
    .split(';')[0]!
