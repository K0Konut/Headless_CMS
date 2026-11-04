import { Controller, Get, Header, Query, Req, Res, Sse, UseGuards } from '@nestjs/common'
import type { MessageEvent } from '@nestjs/common'
import { analyticsQuerySchema } from '@dashility/shared'
import type { Response } from 'express'
import { from, interval, map, merge, type Observable } from 'rxjs'
import { type SpaceRequest, SpaceAccessGuard } from '../spaces/guards.js'
import { AnalyticsService } from './analytics.service.js'
import { LiveService } from './live.service.js'

/** Champ CSV : entre guillemets si besoin, guillemets doublés. */
const csvField = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value

@Controller('spaces/:slug/analytics')
@UseGuards(SpaceAccessGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly live: LiveService,
  ) {}

  @Get()
  summary(@Req() { space }: SpaceRequest, @Query() query: unknown) {
    const { from, to } = analyticsQuerySchema.parse(query)
    return this.analytics.summary(space.id, from, to)
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @Req() { space }: SpaceRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { from, to } = analyticsQuerySchema.parse(query)
    const rows = await this.analytics.export(space.id, from, to)
    res.attachment(`analytics-${space.slug}-${from}-${to}.csv`)
    const lines = rows.map((r) =>
      [r.createdAt.toISOString(), r.kind, r.path, r.referrer].map(csvField).join(','),
    )
    // BOM : Excel ouvre alors le fichier en UTF-8.
    return '﻿' + ['date,type,page,provenance', ...lines].join('\r\n') + '\r\n'
  }

  /** Flux SSE : un état initial, puis chaque nouvel événement. Un battement toutes les 30 s
   *  garde la connexion ouverte à travers le proxy. */
  @Sse('live')
  stream(@Req() { space }: SpaceRequest): Observable<MessageEvent> {
    return merge(
      from(this.analytics.liveSnapshot(space.id)).pipe(map((data) => ({ type: 'snapshot', data }))),
      this.live.stream(space.id).pipe(map((data) => ({ type: 'event', data }))),
      interval(30_000).pipe(map(() => ({ type: 'ping', data: '' }))),
    )
  }
}
