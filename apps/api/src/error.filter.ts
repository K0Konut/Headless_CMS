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
      const code = (HttpStatus[status] ?? 'error').toLowerCase()
      return res.status(status).json({ error: { code, message: err.message } })
    }
    this.logger.error(err)
    res.status(500).json({ error: { code: 'internal_server_error', message: 'Erreur interne' } })
  }
}
