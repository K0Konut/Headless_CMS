import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { createSpaceSchema, invitationSchema, updateSpaceSchema } from '@dashility/shared'
import { AuthService } from '../auth/auth.service.js'
import { CurrentUser, SuperAdminGuard } from '../auth/session.guard.js'
import type { User } from '../db/index.js'
import { type SpaceRequest, SpaceAccessGuard } from './guards.js'
import { uuidOr404 } from '../uuid-or-404.pipe.js'
import { SpacesService } from './spaces.service.js'

@Controller('spaces')
export class SpacesController {
  constructor(
    private readonly auth: AuthService,
    private readonly spaces: SpacesService,
  ) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.auth.accessibleSpaces(user)
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  create(@Body() body: unknown) {
    return this.spaces.create(createSpaceSchema.parse(body))
  }
}

@Controller('spaces/:slug')
@UseGuards(SpaceAccessGuard)
export class SpaceController {
  constructor(private readonly spaces: SpacesService) {}

  /** La clé publique n'est renvoyée qu'au super-admin (Réglages › Intégration). */
  @Get()
  get(@Req() { space, user }: SpaceRequest) {
    const { id, publicKey, ...rest } = space
    return user.isSuperAdmin ? { ...rest, publicKey } : rest
  }

  @Patch()
  @UseGuards(SuperAdminGuard)
  update(@Req() { space }: SpaceRequest, @Body() body: unknown) {
    return this.spaces.update(space, updateSpaceSchema.parse(body))
  }

  @Delete()
  @UseGuards(SuperAdminGuard)
  @HttpCode(204)
  remove(@Req() { space }: SpaceRequest) {
    return this.spaces.remove(space)
  }

  @Get('members')
  @UseGuards(SuperAdminGuard)
  members(@Req() { space }: SpaceRequest) {
    return this.spaces.members(space)
  }

  @Post('invitations')
  @UseGuards(SuperAdminGuard)
  invite(@Req() { space }: SpaceRequest, @Body() body: unknown) {
    return this.spaces.invite(space, invitationSchema.parse(body).email)
  }

  @Delete('invitations/:id')
  @UseGuards(SuperAdminGuard)
  @HttpCode(204)
  cancelInvitation(@Req() { space }: SpaceRequest, @Param('id') id: string) {
    return this.spaces.cancelInvitation(space, id)
  }

  @Delete('members/:userId')
  @UseGuards(SuperAdminGuard)
  @HttpCode(204)
  removeMember(@Req() { space }: SpaceRequest, @Param('userId', uuidOr404) userId: string) {
    return this.spaces.removeMember(space, userId)
  }
}
