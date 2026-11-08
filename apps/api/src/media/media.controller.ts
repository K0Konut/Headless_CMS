import {
  type ArgumentsHost,
  Catch,
  Controller,
  type ExceptionFilter,
  Get,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { MAX_MEDIA_BYTES } from '@dashility/shared'
import type { Response } from 'express'
import { Public } from '../auth/session.guard.js'
import { type SpaceRequest, SpaceAccessGuard } from '../spaces/guards.js'
import { uuidOr404 } from '../uuid-or-404.pipe.js'
import { MediaService, type UploadedFile as File } from './media.service.js'

/** Fichier au-delà de la limite de multer : son message est en anglais. */
@Catch(PayloadTooLargeException)
class FileTooLargeFilter implements ExceptionFilter {
  catch(_err: PayloadTooLargeException, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(413)
      .json({
        error: { code: 'payload_too_large', message: 'Fichier trop volumineux : 10 Mo au plus' },
      })
  }
}

/** Envoi et description des médias d'un espace : tous ses membres remplissent les entrées. */
@Controller('spaces/:slug/media')
@UseGuards(SpaceAccessGuard)
export class SpaceMediaController {
  constructor(private readonly media: MediaService) {}

  /** `multipart/form-data`, champ `file`, avec l'en-tête `X-Requested-With: dashility`
   *  (protection CSRF, vérifiée par le middleware `requireJson`). */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MEDIA_BYTES, files: 1 } }))
  @UseFilters(FileTooLargeFilter)
  upload(@Req() { space }: SpaceRequest, @UploadedFile() file: File | undefined) {
    return this.media.upload(space, file)
  }

  @Get(':id')
  get(@Req() { space }: SpaceRequest, @Param('id', uuidOr404) id: string) {
    return this.media.get(space, id)
  }
}

/** Service public des fichiers (architecture, « Médias ») : un nouveau fichier a toujours un
 *  nouvel identifiant, donc une adresse n'a jamais besoin d'être invalidée. */
@Controller('media')
@Public()
export class PublicMediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':id/:file')
  async serve(
    @Param('id', uuidOr404) id: string,
    @Param('file') name: string,
    @Res() res: Response,
  ) {
    const file = await this.media.file(id, name)
    if (!file) throw new NotFoundException('Fichier introuvable')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.setHeader('Content-Type', file.type)
    // Les sites peuvent afficher les images depuis leur propre origine.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    if (file.type === 'application/pdf') {
      res.setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      )
    }
    // Stockage injoignable ou fichier absent : 404, l'édition du texte continue (architecture).
    res.sendFile(file.path, (err) => {
      if (err && !res.headersSent) {
        res.removeHeader('Cache-Control')
        res.status(404).json({ error: { code: 'not_found', message: 'Fichier introuvable' } })
      }
    })
  }
}
