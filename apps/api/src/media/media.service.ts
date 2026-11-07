import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { MAX_MEDIA_BYTES, imageWidths } from '@dashility/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { contentTypes, entries, media } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'
import { mediaPath } from './storage.js'

/** Ce que l'API renvoie d'un média. */
const mediaColumns = {
  id: media.id,
  kind: media.kind,
  originalName: media.originalName,
  width: media.width,
  height: media.height,
  bytes: media.bytes,
  createdAt: media.createdAt,
}

/** Fichier reçu par multer (en mémoire). */
export interface UploadedFile {
  buffer: Buffer
  originalname: string
  size: number
}

const IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp'])
const UNAVAILABLE = 'Le stockage des fichiers est indisponible. Réessayez dans un instant.'

/** Nom affiché d'un fichier : sans chemin ni caractères de contrôle, 200 caractères au plus. */
function displayName(name: string) {
  // Multer lit le nom en latin-1 : on le relit en UTF-8 (« CV Léa.pdf »).
  const utf8 = Buffer.from(name, 'latin1').toString('utf8')
  const base = (utf8.includes('�') ? name : utf8).split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || 'fichier'
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name)

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Envoi d'une image (JPEG, PNG, WebP) ou d'un PDF (architecture, « Médias ») : le type réel
   *  est vérifié, l'orientation appliquée, les métadonnées EXIF retirées, et les variantes WebP
   *  et AVIF produites tout de suite. */
  async upload(space: Space, file: UploadedFile | undefined) {
    if (!file?.buffer.length) throw new BadRequestException('Aucun fichier reçu')
    if (file.size > MAX_MEDIA_BYTES)
      throw new BadRequestException('Fichier trop volumineux : 10 Mo au plus')
    const id = randomUUID()
    const name = displayName(file.originalname)

    let row: typeof media.$inferInsert
    if (file.buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
      row = { id, spaceId: space.id, kind: 'pdf', originalName: name, bytes: file.size }
      await this.write(space, id, async (dir) => writeFile(`${dir}/original.pdf`, file.buffer))
    } else {
      // Une image géante (bombe de décompression) est refusée avant d'être décodée.
      const image = sharp(file.buffer, { limitInputPixels: 50_000_000 })
      const meta = await image.metadata().catch(() => null)
      if (!meta?.format || !IMAGE_FORMATS.has(meta.format)) {
        throw new UnsupportedMediaTypeException(
          'Type de fichier non accepté : JPEG, PNG, WebP ou PDF',
        )
      }
      // Orientation appliquée une fois ; les variantes partent de cette image redressée, sans EXIF.
      const { data, info } = await image
        .rotate()
        .toBuffer({ resolveWithObject: true })
        .catch(() => {
          throw new UnsupportedMediaTypeException('Image illisible')
        })
      row = {
        id,
        spaceId: space.id,
        kind: 'image',
        originalName: name,
        width: info.width,
        height: info.height,
        bytes: file.size,
      }
      await this.write(space, id, async (dir) => {
        await writeFile(
          `${dir}/original.${meta.format === 'jpeg' ? 'jpg' : meta.format}`,
          file.buffer,
        )
        for (const width of imageWidths(info.width)) {
          const resized = sharp(data).resize({ width, withoutEnlargement: true })
          await resized.clone().webp({ quality: 80 }).toFile(`${dir}/${width}.webp`)
          await resized.clone().avif({ quality: 55, effort: 4 }).toFile(`${dir}/${width}.avif`)
        }
      })
    }

    try {
      const [created] = await this.db.insert(media).values(row).returning(mediaColumns)
      return created!
    } catch (err) {
      await rm(mediaPath(space.id, id), { recursive: true, force: true }).catch(() => undefined)
      throw err
    }
  }

  /** Écrit les fichiers d'un média ; un échec du stockage (NAS injoignable) répond 503 et ne
   *  laisse rien derrière lui. */
  private async write(space: Space, id: string, files: (dir: string) => Promise<unknown>) {
    const dir = mediaPath(space.id, id)
    try {
      await mkdir(dir, { recursive: true })
      await files(dir)
    } catch (err) {
      this.logger.error(err)
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
      throw new ServiceUnavailableException(UNAVAILABLE)
    }
  }

  async get(space: Space, id: string) {
    const [row] = await this.db
      .select(mediaColumns)
      .from(media)
      .where(and(eq(media.id, id), eq(media.spaceId, space.id)))
    if (!row) throw new NotFoundException('Fichier introuvable')
    return row
  }

  /** Les médias cités par une entrée doivent exister dans son espace, avec le bon type. */
  async checkRefs(space: Space, refs: { id: string; kind: 'image' | 'pdf' }[]) {
    if (!refs.length) return
    const ids = [...new Set(refs.map((r) => r.id))]
    const rows = await this.db
      .select({ id: media.id, kind: media.kind })
      .from(media)
      .where(and(eq(media.spaceId, space.id), inArray(media.id, ids)))
    const known = new Map(rows.map((r) => [r.id, r.kind]))
    if (refs.some((r) => known.get(r.id) !== r.kind)) {
      throw new BadRequestException('Fichier introuvable dans cet espace')
    }
  }

  /** Fichier à servir : `<largeur>.webp`, `<largeur>.avif` pour une image, `original.pdf` pour
   *  un PDF. L'original d'une image n'est jamais servi (il garde ses métadonnées EXIF). */
  async file(id: string, file: string) {
    const [row] = await this.db
      .select({
        spaceId: media.spaceId,
        kind: media.kind,
        width: media.width,
        name: media.originalName,
      })
      .from(media)
      .where(eq(media.id, id))
    if (!row) return null
    if (row.kind === 'pdf') {
      return file === 'original.pdf'
        ? { path: mediaPath(row.spaceId, id, file), type: 'application/pdf', name: row.name }
        : null
    }
    const match = /^(\d+)\.(webp|avif)$/.exec(file)
    if (!match || !imageWidths(row.width!).includes(Number(match[1]))) return null
    return { path: mediaPath(row.spaceId, id, file), type: `image/${match[2]}`, name: row.name }
  }

  /** Médias orphelins (architecture, « Fichiers orphelins ») : plus de 24 h, et cités ni par la
   *  version en ligne ni par le brouillon d'aucune entrée de leur espace. Un fichier remplacé
   *  reste donc servi tant que la version publiée l'utilise. */
  @Cron('30 3 * * *', { timeZone: 'Europe/Paris' })
  async purgeOrphans() {
    const removed = await this.db
      .delete(media)
      .where(
        and(
          sql`${media.createdAt} < now() - interval '24 hours'`,
          sql`not exists (
            select 1 from ${entries}
            join ${contentTypes} on ${contentTypes.id} = ${entries.typeId}
            where ${contentTypes.spaceId} = ${media.spaceId}
              and (coalesce(${entries.published}::text, '') || coalesce(${entries.draft}::text, ''))
                like '%' || ${media.id}::text || '%'
          )`,
        ),
      )
      .returning({ id: media.id, spaceId: media.spaceId })
    for (const { id, spaceId } of removed) {
      await rm(mediaPath(spaceId, id), { recursive: true, force: true }).catch((err) =>
        this.logger.warn(`Fichiers du média ${id} non supprimés : ${String(err)}`),
      )
    }
    return removed.length
  }
}
