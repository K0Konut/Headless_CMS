import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { LOCALES } from '@dashility/shared'
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { Public } from '../auth/session.guard.js'
import { PublicApiService } from './public-api.service.js'

const querySchema = z.object({ locale: z.enum(LOCALES).default('fr') })

/** En-têtes de toutes les réponses d'aperçu, erreurs comprises : posés par un middleware, qui
 *  passe avant la limitation de débit (un 429 reste lisible par le site). */
export function previewHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Robots-Tag', 'noindex')
  next()
}

/** Lecture d'un aperçu par la page d'aperçu d'un site, depuis le navigateur (V3). Sans session
 *  ni clé : le jeton donne accès à une entrée, en lecture, 24 h. CORS ouvert à toutes les
 *  origines, sans cookie : le jeton est le seul secret, et le site doit pouvoir lire les erreurs
 *  (lien expiré, entrée supprimée), y compris pour un jeton inconnu dont on ignore le site. */
@Controller('preview')
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ ip: { limit: 60, ttl: 60_000 } })
@SkipThrottle({ email: true })
export class PreviewController {
  constructor(private readonly api: PublicApiService) {}

  @Get(':token')
  read(@Req() req: Request, @Param('token') token: string, @Query() query: unknown) {
    const { locale } = querySchema.parse(query)
    return this.api.preview(token, locale, `${req.protocol}://${req.get('host')}`)
  }
}
