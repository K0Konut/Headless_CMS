import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { changePasswordSchema, loginSchema } from '@dashility/shared'
import type { Request, Response } from 'express'
import type { User } from '../db/index.js'
import { AuthService } from './auth.service.js'
import {
  type AuthedRequest,
  CurrentUser,
  Public,
  SESSION_COOKIE,
  setSessionCookie,
} from './session.guard.js'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { email, password } = loginSchema.parse(body)
    const session = await this.auth.login(email, password)
    if (!session) throw new UnauthorizedException('Email ou mot de passe incorrect')
    setSessionCookie(res, session.token)
    return this.auth.me(session.user)
  }

  /** Publique : un cookie dont la session est déjà fermée doit quand même être effacé. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: unknown = req.cookies?.[SESSION_COOKIE]
    if (typeof token === 'string') await this.auth.logout(token)
    res.clearCookie(SESSION_COOKIE, { path: '/' })
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.auth.me(user)
  }

  @Put('password')
  @HttpCode(204)
  async changePassword(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { currentPassword, newPassword } = changePasswordSchema.parse(body)
    const ok = await this.auth.changePassword(
      req.user,
      req.sessionToken,
      currentPassword,
      newPassword,
    )
    // 400 et non 401 : la session est valide, seul le champ est faux.
    if (!ok) throw new BadRequestException('Mot de passe actuel incorrect')
  }
}
