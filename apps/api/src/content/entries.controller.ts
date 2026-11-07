import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { saveEntrySchema } from '@dashility/shared'
import { type SpaceRequest, SpaceAccessGuard } from '../spaces/guards.js'
import { uuidOr404 } from '../uuid-or-404.pipe.js'
import { EntriesService, type EntryRef } from './entries.service.js'

/** Entrées d'un type : tous les membres de l'espace les lisent et les modifient (PRD, « Rôles »).
 *  `single` désigne l'entrée d'une page unique ; sinon l'identifiant d'une entrée de collection. */
@Controller('spaces/:slug/types/:type/entries')
@UseGuards(SpaceAccessGuard)
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get()
  list(@Req() { space }: SpaceRequest, @Param('type') type: string) {
    return this.entries.list(space, type)
  }

  @Post()
  create(@Req() { space, user }: SpaceRequest, @Param('type') type: string) {
    return this.entries.create(space, type, user)
  }

  @Get('single')
  getSingle(@Req() req: SpaceRequest, @Param('type') type: string) {
    return this.get(req, type, 'single')
  }

  @Get(':id')
  get(
    @Req() { space }: SpaceRequest,
    @Param('type') type: string,
    @Param('id', uuidOr404) id: EntryRef,
  ) {
    return this.entries.get(space, type, id)
  }

  @Patch('single')
  saveSingle(@Req() req: SpaceRequest, @Param('type') type: string, @Body() body: unknown) {
    return this.save(req, type, 'single', body)
  }

  @Patch(':id')
  save(
    @Req() { space, user }: SpaceRequest,
    @Param('type') type: string,
    @Param('id', uuidOr404) id: EntryRef,
    @Body() body: unknown,
  ) {
    return this.entries.save(space, type, id, saveEntrySchema.parse(body), user)
  }
}
