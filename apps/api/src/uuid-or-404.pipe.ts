import { NotFoundException, ParseUUIDPipe } from '@nestjs/common'

/** Pipe pour les identifiants : un identifiant mal formé désigne une ressource qui n'existe pas. */
export const uuidOr404 = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException() })
