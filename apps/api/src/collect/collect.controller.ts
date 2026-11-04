import { Body, Controller, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { collectEventSchema } from '@cms/shared'
import { eq } from 'drizzle-orm'
import { Public } from '../auth/session.guard.js'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { events, spaces } from '../db/schema.js'

// shortcut: liste de robots maison, passer au paquet isbot si des robots passent au travers
const BOTS =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget|python|httpclient|okhttp|go-http/i

/** Corps envoyé par `sendBeacon` : du JSON dans un `text/plain`, pour éviter la requête CORS
 *  préalable. */
function parseEvent(body: unknown) {
  if (typeof body !== 'string') return null
  try {
    return collectEventSchema.safeParse(JSON.parse(body)).data ?? null
  } catch {
    return null
  }
}

/** Collecte publique des sites. Répond toujours 204, sans détail, même quand l'événement est
 *  ignoré : un site ne peut pas sonder les clés ou les origines acceptées. */
@Controller('e')
export class CollectController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ ip: { limit: 60, ttl: 60_000 } })
  @SkipThrottle({ email: true })
  @Post()
  @HttpCode(204)
  async collect(
    @Body() body: unknown,
    @Headers('origin') origin?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const event = parseEvent(body)
    if (!event || !origin || !userAgent || BOTS.test(userAgent)) return

    const [space] = await this.db
      .select({ id: spaces.id, siteUrl: spaces.siteUrl })
      .from(spaces)
      .where(eq(spaces.publicKey, event.k))
    if (!space || space.siteUrl !== origin) return

    await this.db
      .insert(events)
      .values({ spaceId: space.id, kind: event.t, path: event.p, referrer: event.r ?? '' })
  }
}
