import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Response } from 'express'
import { ZodError } from 'zod'

/** Format unique des erreurs : `{ error: { code, message } }`. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name)

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: { code: 'validation', message: err.issues[0]?.message ?? 'Requête invalide' },
      })
    }
    if (err instanceof HttpException) {
      const status = err.getStatus()
      // Détails facultatifs d'une erreur : un code précis et, pour une publication refusée, la
      // liste des champs fautifs.
      const body = err.getResponse() as { code?: unknown; issues?: unknown }
      const code =
        typeof body?.code === 'string' ? body.code : (HttpStatus[status] ?? 'error').toLowerCase()
      const issues = Array.isArray(body?.issues) ? { issues: body.issues } : {}
      return res.status(status).json({ error: { code, message: err.message, ...issues } })
    }
    this.logger.error(err)
    res.status(500).json({ error: { code: 'internal_server_error', message: 'Erreur interne' } })
  }
}
