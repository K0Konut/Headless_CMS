import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { consumeTokenSchema } from '@dashility/shared'
import type { Request, Response } from 'express'
import { uuidOr404 } from '../uuid-or-404.pipe.js'
import { AuthService } from './auth.service.js'
import { LinksService } from './links.service.js'
import { Public, SESSION_COOKIE, SuperAdminGuard, setSessionCookie } from './session.guard.js'

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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { password } = consumeTokenSchema.parse(body)
    const { user, existing } = await this.links.consume(token, password)
    if (existing) {
      throw new ConflictException(
        'Un compte existe déjà pour cet email : il a été ajouté à l’espace, connectez-vous',
      )
    }
    // Une session déjà ouverte dans ce navigateur est remplacée : on la ferme aussi en base.
    const previous: unknown = req.cookies?.[SESSION_COOKIE]
    if (typeof previous === 'string') await this.auth.logout(previous)
    setSessionCookie(res, await this.auth.openSession(user.id))
    return this.auth.me(user)
  }

  @Post('users/:id/password-reset')
  @UseGuards(SuperAdminGuard)
  createReset(@Param('id', uuidOr404) id: string) {
    return this.links.createReset(id)
  }
}
