import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule } from '@nestjs/throttler'
import { emailSchema } from '@dashility/shared'
import { AnalyticsController } from './analytics/analytics.controller.js'
import { AnalyticsService } from './analytics/analytics.service.js'
import { LiveService } from './analytics/live.service.js'
import { AuthController } from './auth/auth.controller.js'
import { AuthService } from './auth/auth.service.js'
import { LinksController } from './auth/links.controller.js'
import { LinksService } from './auth/links.service.js'
import { SessionGuard } from './auth/session.guard.js'
import { CollectController } from './collect/collect.controller.js'
import { EntriesController, TodoController, TrashController } from './content/entries.controller.js'
import { EntriesService } from './content/entries.service.js'
import { FeaturingService } from './content/featuring.service.js'
import { TypesController } from './content/types.controller.js'
import { TypesService } from './content/types.service.js'
import { RetentionService } from './collect/retention.service.js'
import { PublicMediaController, SpaceMediaController } from './media/media.controller.js'
import { MediaService } from './media/media.service.js'
import { ApiKeyGuard } from './public-api/public-api.guard.js'
import { PreviewController, previewHeaders } from './public-api/preview.controller.js'
import { FeaturedController, PublicApiController } from './public-api/public-api.controller.js'
import { PublicApiService } from './public-api/public-api.service.js'
import { DeployController } from './deploy/deploy.controller.js'
import { DeployService } from './deploy/deploy.service.js'
import { DbModule } from './db/db.module.js'
import { ErrorFilter } from './error.filter.js'
import { requireJson } from './require-json.middleware.js'
import { SpaceController, SpacesController } from './spaces/spaces.controller.js'
import { SpacesService } from './spaces/spaces.service.js'

@Module({
  imports: [
    DbModule,
    ScheduleModule.forRoot(),
    // Compteurs en mémoire : les IP ne sont jamais écrites en base.
    ThrottlerModule.forRoot([
      { name: 'ip', ttl: 60_000, limit: 5 },
      {
        name: 'email',
        ttl: 60_000,
        limit: 5,
        // Même normalisation qu'à la connexion : « A@b.fr » et « a@b.fr » partagent un compteur.
        getTracker: (req) => emailSchema.safeParse(req.body?.email).data ?? '',
      },
    ]),
  ],
  controllers: [
    AnalyticsController,
    AuthController,
    CollectController,
    DeployController,
    LinksController,
    FeaturedController,
    PreviewController,
    PublicApiController,
    PublicMediaController,
    SpaceMediaController,
    SpacesController,
    SpaceController,
    TypesController,
    EntriesController,
    TodoController,
    TrashController,
  ],
  providers: [
    AnalyticsService,
    AuthService,
    DeployService,
    LiveService,
    LinksService,
    MediaService,
    ApiKeyGuard,
    PublicApiService,
    RetentionService,
    SpacesService,
    TypesService,
    EntriesService,
    FeaturingService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // La collecte reçoit du text/plain (sendBeacon) ; elle n'utilise ni session ni cookie.
    consumer.apply(requireJson).exclude({ path: 'e', method: RequestMethod.POST }).forRoutes('*')
    consumer.apply(previewHeaders).forRoutes(PreviewController)
  }
}
