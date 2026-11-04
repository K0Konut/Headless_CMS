<script setup lang="ts">
import { Pause, Play } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { LiveEvent } from '@/lib/analytics'
import { formatNumber, formatTime } from '@/lib/format'

const props = defineProps<{ slug: string }>()
const emit = defineEmits<{ event: [LiveEvent] }>()

const WINDOW_MS = 30 * 60_000
const keyOf = (e: LiveEvent) => `${e.at}|${e.kind}|${e.path}`

/** Horodatages ISO des vues de la fenêtre ; un ensemble dédoublonne l'état initial et le direct. */
const viewTimes = ref(new Set<string>())
const recent = ref<LiveEvent[]>([])
const status = ref<'connecting' | 'open' | 'reconnecting' | 'closed' | 'paused'>('connecting')
const views = computed(() => viewTimes.value.size)
let source: EventSource | undefined

/** Retire les vues sorties de la fenêtre : elle glisse aussi sans nouvel événement. */
function prune() {
  const since = Date.now() - WINDOW_MS
  for (const at of viewTimes.value) if (Date.parse(at) <= since) viewTimes.value.delete(at)
}
const tick = setInterval(prune, 30_000)

/** Ajoute des événements à la liste, sans doublon, du plus récent au plus ancien. */
function addRecent(events: LiveEvent[]) {
  const byKey = new Map([...events, ...recent.value].map((e) => [keyOf(e), e]))
  recent.value = [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20)
}

function connect() {
  source?.close()
  status.value = 'connecting'
  recent.value = []
  viewTimes.value.clear()
  source = new EventSource(`/api/spaces/${encodeURIComponent(props.slug)}/analytics/live`)
  source.addEventListener('open', () => (status.value = 'open'))
  source.addEventListener('error', () => {
    if (source?.readyState !== EventSource.CLOSED) return void (status.value = 'reconnecting')
    // Abandon définitif (session expirée, accès retiré) : api() renvoie à la connexion si besoin.
    status.value = 'closed'
    void api('/auth/me').catch(() => {})
  })
  // L'état initial peut arriver après des événements en direct : on fusionne, sans écraser.
  source.addEventListener('snapshot', (e) => {
    const data = JSON.parse(e.data) as { viewTimes: string[]; recent: LiveEvent[] }
    for (const at of data.viewTimes) viewTimes.value.add(at)
    addRecent(data.recent)
    prune()
    status.value = 'open'
  })
  source.addEventListener('event', (e) => {
    const event = JSON.parse(e.data) as LiveEvent
    if (event.kind === 'view') viewTimes.value.add(event.at)
    addRecent([event])
    emit('event', event)
  })
}

/** Pause (WCAG 2.2.2) : la connexion est fermée, puis rouverte avec un état à jour. */
function toggle() {
  if (status.value === 'paused' || status.value === 'closed') return connect()
  source?.close()
  status.value = 'paused'
}

watch(() => props.slug, connect, { immediate: true })
onBeforeUnmount(() => {
  source?.close()
  clearInterval(tick)
})
</script>

<template>
  <section aria-labelledby="live-title" class="rounded-lg border bg-card p-4">
    <div class="flex items-center justify-between gap-2">
      <h2 id="live-title" class="font-semibold">Temps réel</h2>
      <Badge v-if="status === 'reconnecting'" variant="secondary">Reconnexion…</Badge>
      <Badge v-else-if="status === 'closed'" variant="secondary">Interrompu</Badge>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="
          status === 'paused' || status === 'closed'
            ? 'Reprendre le temps réel'
            : 'Mettre le temps réel en pause'
        "
        :aria-pressed="status === 'paused'"
        @click="toggle"
      >
        <component
          :is="status === 'paused' || status === 'closed' ? Play : Pause"
          aria-hidden="true"
        />
      </Button>
    </div>
    <p class="mt-1 text-sm">
      <strong class="tabular-nums">{{ formatNumber(views) }}</strong>
      {{ views > 1 ? 'vues' : 'vue' }} sur les 30 dernières minutes
    </p>
    <!-- Flux non annoncé par les lecteurs d'écran : il les saturerait. -->
    <ol v-if="recent.length" class="mt-3 grid max-h-72 gap-2 overflow-y-auto text-sm">
      <li v-for="event in recent" :key="keyOf(event)" class="grid">
        <span class="text-muted-foreground tabular-nums">
          {{ formatTime(event.at) }} {{ event.kind === 'cv' ? 'CV' : 'Vue' }}
        </span>
        <span class="truncate" :title="event.path">{{ event.path }}</span>
      </li>
    </ol>
    <p v-else class="mt-3 text-sm text-muted-foreground">Aucun événement récent.</p>
  </section>
</template>
