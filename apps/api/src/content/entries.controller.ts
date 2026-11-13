import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  NotFoundException,
  ParseIntPipe,
  type PipeTransform,
  UseGuards,
} from '@nestjs/common'
import { entryActionSchema, saveEntrySchema, scheduleEntrySchema } from '@dashility/shared'
import { type SpaceRequest, SpaceAccessGuard } from '../spaces/guards.js'
import { uuidOr404 } from '../uuid-or-404.pipe.js'
import { EntriesService, type EntryRef } from './entries.service.js'

/** Ce qui reste à faire dans le contenu d'un espace (écran Contenu). */
@Controller('spaces/:slug/todo')
@UseGuards(SpaceAccessGuard)
export class TodoController {
  constructor(private readonly entries: EntriesService) {}

  @Get()
  list(@Req() { space }: SpaceRequest) {
    return this.entries.todo(space)
  }
}

/** `single`, ou l'identifiant d'une entrée de collection (sinon 404). */
const singleOrUuid: PipeTransform<string, Promise<EntryRef>> = {
  transform: async (value, meta) =>
    value === 'single' ? value : ((await uuidOr404.transform(value, meta)) as string),
}

/** Numéro de version : un entier positif, sinon 404 comme une version qui n'existe pas. */
const versionNumber = new ParseIntPipe({ errorHttpStatusCode: 404 })

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

  /** Programmer la publication, ou changer sa date (V3). */
  @Put(':id/schedule')
  schedule(
    @Req() { space }: SpaceRequest,
    @Param('type') type: string,
    @Param('id', singleOrUuid) id: EntryRef,
    @Body() body: unknown,
  ) {
    return this.entries.schedule(space, type, id, scheduleEntrySchema.parse(body))
  }

  /** Annuler la programmation. */
  @Delete(':id/schedule')
  unschedule(
    @Req() { space }: SpaceRequest,
    @Param('type') type: string,
    @Param('id', singleOrUuid) id: EntryRef,
  ) {
    return this.entries.unschedule(space, type, id)
  }

  /** Historique (V4). */
  @Get(':id/versions')
  versions(
    @Req() { space }: SpaceRequest,
    @Param('type') type: string,
    @Param('id', singleOrUuid) id: EntryRef,
  ) {
    return this.entries.versions(space, type, id)
  }

  @Get(':id/versions/:number')
  version(
    @Req() { space }: SpaceRequest,
    @Param('type') type: string,
    @Param('id', singleOrUuid) id: EntryRef,
    @Param('number', versionNumber) number: number,
  ) {
    return this.entries.version(space, type, id, number)
  }

  @Post(':id/versions/:number/restore')
  @HttpCode(200)
  restore(
    @Req() { space, user }: SpaceRequest,
    @Param('type') type: string,
    @Param('id', singleOrUuid) id: EntryRef,
    @Param('number', versionNumber) number: number,
    @Body() body: unknown,
  ) {
    const { version } = entryActionSchema.parse(body)
    return this.entries.restore(space, type, id, number, version, user)
  }

  /** Lien d'aperçu (V3). Déclarée avant `:id/:action`, qui la prendrait sinon. */
  @Post(':id/preview')
  preview(
    @Req() { space }: SpaceRequest,
    @Param('type') type: string,
    @Param('id', singleOrUuid) id: EntryRef,
  ) {
    return this.entries.preview(space, type, id)
  }

  /** Publier, annuler les modifications, dépublier : `single` ou l'identifiant d'une entrée. */
  @Post(':id/:action')
  @HttpCode(200)
  act(
    @Req() { space, user }: SpaceRequest,
    @Param('type') type: string,
    @Param('id', singleOrUuid) id: EntryRef,
    @Param('action') action: string,
    @Body() body: unknown,
  ) {
    const { version } = entryActionSchema.parse(body)
    switch (action) {
      case 'publish':
        return this.entries.publish(space, type, id, version, user)
      case 'discard':
        return this.entries.discard(space, type, id, version, user)
      case 'unpublish':
        return this.entries.unpublish(space, type, id, version, user)
      default:
        throw new NotFoundException()
    }
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() { space }: SpaceRequest,
    @Param('type') type: string,
    @Param('id', singleOrUuid) id: EntryRef,
  ) {
    return this.entries.remove(space, type, id)
  }
}
