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
import { imageWidths, mediaRefs } from '@dashility/shared'
import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { contentTypes, entries, entryVersions, media } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'
import { mediaPath, removeMediaDir } from './storage.js'

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

/** Attend toutes les écritures, puis lève la première erreur : le dossier n'est nettoyé qu'une
 *  fois plus rien n'y écrit. */
async function settled(writes: Promise<unknown>[]) {
  const failed = (await Promise.allSettled(writes)).find((r) => r.status === 'rejected')
  if (failed) throw failed.reason
}

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
    // La taille est vérifiée avant, par multer (limits.fileSize du contrôleur).
    if (!file?.buffer.length) throw new BadRequestException('Aucun fichier reçu')
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
      // Décodée une seule fois, orientation appliquée : une image abîmée est refusée ici, avant
      // d'écrire quoi que ce soit. Les variantes partent de ces pixels bruts (sans EXIF).
      const { data, info } = await image
        .rotate()
        .raw()
        .toBuffer({ resolveWithObject: true })
        .catch(() => {
          throw new UnsupportedMediaTypeException('Image illisible')
        })
      const pixels = () =>
        sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      row = {
        id,
        spaceId: space.id,
        kind: 'image',
        originalName: name,
        width: info.width,
        height: info.height,
        bytes: file.size,
      }
      await this.write(space, id, (dir) =>
        settled([
          writeFile(`${dir}/original.${meta.format === 'jpeg' ? 'jpg' : meta.format}`, file.buffer),
          ...imageWidths(info.width).flatMap((w) => {
            const resized = () => pixels().resize({ width: w, withoutEnlargement: true })
            return [
              resized().webp({ quality: 80 }).toFile(`${dir}/${w}.webp`),
              resized().avif({ quality: 55, effort: 4 }).toFile(`${dir}/${w}.avif`),
            ]
          }),
        ]),
      )
    }

    try {
      const [created] = await this.db.insert(media).values(row).returning(mediaColumns)
      return created!
    } catch (err) {
      await removeMediaDir(space.id, id)
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
      await removeMediaDir(space.id, id)
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
   *  version en ligne, ni par le brouillon, ni par une version de l'historique d'aucune entrée de
   *  leur espace. Un fichier remplacé reste donc servi tant que la version publiée l'utilise, et
   *  jusqu'au bout de l'historique. Les références sont lues avec la
   *  définition des champs (`mediaRefs`), comme à l'enregistrement et dans l'API publique. */
  @Cron('30 3 * * *', { timeZone: 'Europe/Paris' })
  async purgeOrphans() {
    const old = await this.db
      .select({ id: media.id, spaceId: media.spaceId })
      .from(media)
      .where(lt(media.createdAt, sql`now() - interval '24 hours'`))
    let removed = 0
    for (const spaceId of new Set(old.map((m) => m.spaceId))) {
      const rows = await this.db
        .select({ fields: contentTypes.fields, published: entries.published, draft: entries.draft })
        .from(entries)
        .innerJoin(contentTypes, eq(contentTypes.id, entries.typeId))
        .where(eq(contentTypes.spaceId, spaceId))
      // Une image d'une ancienne version (V4) reste servie : la restaurer la remet en place.
      const versions = await this.db
        .select({ fields: contentTypes.fields, data: entryVersions.data })
        .from(entryVersions)
        .innerJoin(entries, eq(entries.id, entryVersions.entryId))
        .innerJoin(contentTypes, eq(contentTypes.id, entries.typeId))
        .where(eq(contentTypes.spaceId, spaceId))
      const used = new Set(
        [
          ...rows.flatMap(({ fields, published, draft }) =>
            [published, draft].flatMap((data) => (data ? mediaRefs(fields, data) : [])),
          ),
          ...versions.flatMap(({ fields, data }) => mediaRefs(fields, data)),
        ].map((ref) => ref.id),
      )
      const orphans = old.filter((m) => m.spaceId === spaceId && !used.has(m.id)).map((m) => m.id)
      if (!orphans.length) continue
      await this.db.delete(media).where(inArray(media.id, orphans))
      for (const id of orphans) {
        const err = await removeMediaDir(spaceId, id)
        if (err) this.logger.warn(`Fichiers du média ${id} non supprimés : ${String(err)}`)
      }
      removed += orphans.length
    }
    return removed
  }
}
