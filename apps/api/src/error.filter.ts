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
      // Fichier au-delà de la limite de multer : son message est en anglais.
      const message =
        status === HttpStatus.PAYLOAD_TOO_LARGE
          ? 'Fichier trop volumineux : 10 Mo au plus'
          : err.message
      return res.status(status).json({ error: { code, message, ...issues } })
    }
    this.logger.error(err)
    res.status(500).json({ error: { code: 'internal_server_error', message: 'Erreur interne' } })
  }
}
