import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { saveEntrySchema } from '@dashility/shared'
import { type SpaceRequest, SpaceAccessGuard } from '../spaces/guards.js'
import { EntriesService } from './entries.service.js'

/** Entrées d'un type : tous les membres de l'espace les lisent et les modifient (PRD, « Rôles »). */
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

  @Get(':id')
  get(@Req() { space }: SpaceRequest, @Param('type') type: string, @Param('id') id: string) {
    return this.entries.get(space, type, id)
  }

  @Patch(':id')
  save(
    @Req() { space, user }: SpaceRequest,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.entries.save(space, type, id, saveEntrySchema.parse(body), user)
  }
}
