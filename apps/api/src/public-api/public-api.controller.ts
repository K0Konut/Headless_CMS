import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common'
import { LOCALES } from '@dashility/shared'
import { z } from 'zod'
import { Public } from '../auth/session.guard.js'
import { type ApiKeyRequest, ApiKeyGuard } from './public-api.guard.js'
import { PublicApiService } from './public-api.service.js'

const querySchema = z.object({ locale: z.enum(LOCALES).default('fr') })

/** Origine publique du CMS, pour des adresses de médias absolues. Derrière Nginx Proxy Manager,
 *  le protocole et l'hôte viennent de X-Forwarded-* (`trust proxy` est réglé). */
const origin = (req: ApiKeyRequest) => `${req.protocol}://${req.get('host')}`

/** API de lecture des sites (`/api/v1`) : sans session, avec la clé API de l'espace. Lecture
 *  côté serveur uniquement (build ou serveur du site) : pas de CORS. */
@Controller('v1/content')
@Public()
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(private readonly api: PublicApiService) {}

  @Get(':type')
  content(@Req() req: ApiKeyRequest, @Param('type') type: string, @Query() query: unknown) {
    const { locale } = querySchema.parse(query)
    return this.api.content(req.space, type, locale, origin(req))
  }

  @Get(':type/:slug')
  entry(
    @Req() req: ApiKeyRequest,
    @Param('type') type: string,
    @Param('slug') slug: string,
    @Query() query: unknown,
  ) {
    const { locale } = querySchema.parse(query)
    return this.api.entry(req.space, type, slug, locale, origin(req))
  }
}

/** Mise en avant (V3) : les entrées d'un type à mettre en avant, lues au build du site. Hors de
 *  `v1/content/:type/…`, où `featured` serait pris pour l'identifiant d'une entrée. */
@Controller('v1/featured')
@Public()
@UseGuards(ApiKeyGuard)
export class FeaturedController {
  constructor(private readonly api: PublicApiService) {}

  @Get(':type')
  featured(@Req() req: ApiKeyRequest, @Param('type') type: string, @Query() query: unknown) {
    const { locale } = querySchema.parse(query)
    return this.api.featured(req.space, type, locale, origin(req))
  }
}
