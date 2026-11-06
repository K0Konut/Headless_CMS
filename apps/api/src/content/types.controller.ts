import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  createContentTypeSchema,
  typeOrderSchema,
  updateContentTypeSchema,
} from '@dashility/shared'
import { SuperAdminGuard } from '../auth/session.guard.js'
import { type SpaceRequest, SpaceAccessGuard } from '../spaces/guards.js'
import { TypesService } from './types.service.js'

/** Types de contenu d'un espace. Les membres les lisent (Contenu) ; seul le super-admin
 *  modifie la structure (PRD, « Rôles »). */
@Controller('spaces/:slug')
@UseGuards(SpaceAccessGuard)
export class TypesController {
  constructor(private readonly types: TypesService) {}

  @Get('types')
  list(@Req() { space }: SpaceRequest) {
    return this.types.list(space)
  }

  @Post('types')
  @UseGuards(SuperAdminGuard)
  create(@Req() { space }: SpaceRequest, @Body() body: unknown) {
    return this.types.create(space, createContentTypeSchema.parse(body))
  }

  @Get('types/:type')
  get(@Req() { space }: SpaceRequest, @Param('type') type: string) {
    return this.types.get(space, type)
  }

  @Put('types/:type')
  @UseGuards(SuperAdminGuard)
  update(@Req() { space }: SpaceRequest, @Param('type') type: string, @Body() body: unknown) {
    return this.types.update(space, type, updateContentTypeSchema.parse(body))
  }

  @Delete('types/:type')
  @UseGuards(SuperAdminGuard)
  @HttpCode(204)
  remove(@Req() { space }: SpaceRequest, @Param('type') type: string) {
    return this.types.remove(space, type)
  }

  @Put('type-order')
  @UseGuards(SuperAdminGuard)
  @HttpCode(204)
  reorder(@Req() { space }: SpaceRequest, @Body() body: unknown) {
    return this.types.reorder(space, typeOrderSchema.parse(body).slugs)
  }
}
