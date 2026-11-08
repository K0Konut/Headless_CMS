import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import type { DeployState, deploySettingsSchema } from '@dashility/shared'
import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { DB } from '../db/db.module.js'
import type { Db } from '../db/index.js'
import { spaces } from '../db/schema.js'
import type { Space } from '../spaces/guards.js'

/** Délai de regroupement (architecture, « Déploiement à la publication ») : l'appel part 10 s
 *  après la dernière publication de l'espace. Réglable pour les tests. */
const delay = () => Number(process.env.DEPLOY_DELAY_MS ?? 10_000)
const TIMEOUT_MS = 10_000

/** Appel de l'URL de déploiement d'un espace après une publication. */
@Injectable()
export class DeployService implements OnModuleDestroy {
  private readonly logger = new Logger(DeployService.name)
  // shortcut: minuteurs en mémoire, perdus si l'API redémarre pendant ces 10 s et valables pour
  // une seule instance ; « Lancer un déploiement » rattrape le cas (architecture)
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly running = new Map<string, Promise<void>>()
  /** Une demande est arrivée pendant un appel : elle en relancera un après lui. */
  private readonly again = new Set<string>()

  constructor(@Inject(DB) private readonly db: Db) {}

  onModuleDestroy() {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  /** Une publication vient de changer ce que le site affiche : l'appel part 10 s après la
   *  dernière ; publier trois entrées à la suite ne lance qu'un build. */
  schedule(spaceId: string) {
    clearTimeout(this.timers.get(spaceId))
    this.timers.set(
      spaceId,
      setTimeout(() => void this.call(spaceId), delay()),
    )
  }

  /** « Lancer un déploiement », « Relancer » : tout de suite, sans attendre le regroupement. */
  async callNow(space: Space) {
    this.cancelTimer(space.id)
    await this.call(space.id)
  }

  /** Un appel à la fois par espace. Une demande arrivée pendant un appel en cours en relance un
   *  après lui : le contenu publié entre-temps n'est jamais oublié. */
  private call(spaceId: string): Promise<void> {
    this.timers.delete(spaceId)
    const current = this.running.get(spaceId)
    if (current) {
      this.again.add(spaceId)
      return current
    }
    const run = this.send(spaceId).finally(() => {
      this.running.delete(spaceId)
      if (this.again.delete(spaceId)) void this.call(spaceId)
    })
    this.running.set(spaceId, run)
    return run
  }

  private cancelTimer(spaceId: string) {
    clearTimeout(this.timers.get(spaceId))
    this.timers.delete(spaceId)
  }

  /** `POST deploy_url` au format `repository_dispatch` de GitHub ; les hooks de build qui
   *  n'attendent rien (Netlify, Vercel…) ignorent le corps. Pas de nouvel essai automatique. */
  private async send(spaceId: string) {
    const [space] = await this.db.select().from(spaces).where(eq(spaces.id, spaceId))
    if (!space?.deployUrl) return
    let status: number | null = null
    try {
      const res = await fetch(space.deployUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Dashility',
          ...(space.deployToken && { Authorization: `Bearer ${space.deployToken}` }),
        },
        body: JSON.stringify({
          event_type: 'dashility-publish',
          client_payload: { space: space.slug },
        }),
        // Une redirection est un résultat à afficher, pas une adresse à suivre.
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      status = res.status
    } catch (err) {
      this.logger.warn(`Déploiement de « ${space.slug} » : site injoignable (${String(err)})`)
    }
    await this.db
      .update(spaces)
      .set({ deployCalledAt: new Date(), deployStatus: status })
      .where(eq(spaces.id, spaceId))
  }

  async state(space: Space, superAdmin: boolean): Promise<DeployState> {
    const [row] = await this.db.select().from(spaces).where(eq(spaces.id, space.id))
    const { deployStatus: status, deployCalledAt, deployUrl, deployToken } = row!
    return {
      configured: !!deployUrl,
      pending: this.timers.has(space.id) || this.running.has(space.id),
      last: deployCalledAt
        ? {
            at: deployCalledAt.toISOString(),
            status,
            ok: status !== null && status >= 200 && status < 300,
          }
        : null,
      ...(superAdmin && { url: deployUrl, hasToken: !!deployToken }),
    }
  }

  async configure(space: Space, body: z.infer<typeof deploySettingsSchema>) {
    await this.db
      .update(spaces)
      .set({
        deployUrl: body.url,
        // Sans URL, plus de jeton ; sinon, un jeton absent du corps reste tel quel.
        ...(body.url === null
          ? { deployToken: null }
          : body.token !== undefined && { deployToken: body.token }),
      })
      .where(eq(spaces.id, space.id))
    if (body.url === null) {
      this.cancelTimer(space.id)
      this.again.delete(space.id)
    }
  }
}
