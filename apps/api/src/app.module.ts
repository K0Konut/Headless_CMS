import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { AuthController } from './auth/auth.controller.js'
import { AuthService } from './auth/auth.service.js'
import { SessionGuard } from './auth/session.guard.js'
import { DbModule } from './db/db.module.js'
import { ErrorFilter } from './error.filter.js'

@Module({
  imports: [
    DbModule,
    // Compteurs en mémoire : les IP ne sont jamais écrites en base.
    ThrottlerModule.forRoot([
      { name: 'ip', ttl: 60_000, limit: 5 },
      {
        name: 'email',
        ttl: 60_000,
        limit: 5,
        getTracker: (req) => String(req.body?.email ?? '').toLowerCase(),
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
