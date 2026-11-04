import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common'
import { consumeTokenSchema } from '@cms/shared'
import type { Response } from 'express'
import { SuperAdminGuard, uuidOr404 } from '../spaces/guards.js'
import { AuthService } from './auth.service.js'
import { LinksService } from './links.service.js'
import { Public, setSessionCookie } from './session.guard.js'

@Controller()
export class LinksController {
  constructor(
    private readonly links: LinksService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Get('tokens/:token')
  describe(@Param('token') token: string) {
    return this.links.describe(token)
  }

  /** Consomme le lien, puis connecte directement le compte. */
  @Public()
  @Post('tokens/:token')
  @HttpCode(200)
  async consume(
    @Param('token') token: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.links.consume(token, consumeTokenSchema.parse(body).password)
    setSessionCookie(res, await this.auth.openSession(user.id))
    return this.auth.me(user)
  }

  @Post('users/:id/password-reset')
  @UseGuards(SuperAdminGuard)
  createReset(@Param('id', uuidOr404) id: string) {
    return this.links.createReset(id)
  }
}
