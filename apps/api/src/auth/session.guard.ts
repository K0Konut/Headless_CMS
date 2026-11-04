import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request, Response } from 'express'
import type { User } from '../db/index.js'
import { AuthService, SESSION_TTL_MS } from './auth.service.js'

export const SESSION_COOKIE = 'cms_session'

export type AuthedRequest = Request & { user: User; sessionToken: string }

const IS_PUBLIC = 'isPublic'
/** Route accessible sans session. */
export const Public = () => SetMetadata(IS_PUBLIC, true)

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user,
)

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_MS,
  })
}

/** Guard global : toute route exige une session valide, sauf celles marquées `@Public()`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (isPublic) return true

    const req = ctx.switchToHttp().getRequest<AuthedRequest>()
    const token: unknown = req.cookies?.[SESSION_COOKIE]
    const user = typeof token === 'string' ? await this.auth.userFromSession(token) : null
    if (!user) throw new UnauthorizedException('Session absente ou expirée')

    req.user = user
    req.sessionToken = token as string // garanti par le typeof ci-dessus, que TS ne propage pas
    setSessionCookie(ctx.switchToHttp().getResponse<Response>(), req.sessionToken)
    return true
  }
}
