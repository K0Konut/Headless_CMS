import { Injectable } from '@nestjs/common'
import { Subject, filter, map } from 'rxjs'

export interface LiveEvent {
  at: string
  kind: 'view' | 'cv'
  path: string
}

/** Relie la collecte aux flux temps réel ouverts sur un espace. */
// shortcut: diffusion en mémoire, valable pour une seule instance ; passer à LISTEN/NOTIFY de PostgreSQL si l'API est répliquée
@Injectable()
export class LiveService {
  private readonly events$ = new Subject<LiveEvent & { spaceId: string }>()

  publish(spaceId: string, event: LiveEvent) {
    this.events$.next({ spaceId, ...event })
  }

  stream(spaceId: string) {
    return this.events$.pipe(
      filter((e) => e.spaceId === spaceId),
      map(({ spaceId: _, ...event }) => event),
    )
  }
}
