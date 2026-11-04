<script setup lang="ts">
import { Pause, Play } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { LiveEvent } from '@/lib/analytics'
import { formatNumber, formatTime } from '@/lib/format'

const props = defineProps<{ slug: string }>()
const emit = defineEmits<{ event: [LiveEvent] }>()

const WINDOW_MS = 30 * 60_000

const viewTimes = ref<number[]>([])
const recent = ref<LiveEvent[]>([])
const status = ref<'connecting' | 'open' | 'reconnecting' | 'paused'>('connecting')
const now = ref(Date.now())
let source: EventSource | undefined

// La fenêtre de 30 minutes glisse aussi sans nouvel événement.
const tick = setInterval(() => (now.value = Date.now()), 30_000)
const views = computed(() => viewTimes.value.filter((t) => t > now.value - WINDOW_MS).length)

function connect() {
  source?.close()
  status.value = 'connecting'
  source = new EventSource(`/api/spaces/${encodeURIComponent(props.slug)}/analytics/live`)
  source.addEventListener('open', () => (status.value = 'open'))
  // EventSource se reconnecte tout seul ; on le signale seulement.
  source.addEventListener('error', () => (status.value = 'reconnecting'))
  source.addEventListener('snapshot', (e) => {
    const data = JSON.parse(e.data) as { viewTimes: string[]; recent: LiveEvent[] }
    viewTimes.value = data.viewTimes.map((t) => Date.parse(t))
    recent.value = data.recent
    status.value = 'open'
  })
  source.addEventListener('event', (e) => {
    const event = JSON.parse(e.data) as LiveEvent
    if (event.kind === 'view') viewTimes.value.push(Date.parse(event.at))
    recent.value = [event, ...recent.value].slice(0, 20)
    now.value = Date.now()
    emit('event', event)
  })
}

/** Pause (WCAG 2.2.2) : la connexion est fermée, puis rouverte avec un état à jour. */
function toggle() {
  if (status.value === 'paused') return connect()
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
      <Button
        variant="ghost"
        size="icon"
        :aria-label="
          status === 'paused' ? 'Reprendre le temps réel' : 'Mettre le temps réel en pause'
        "
        :aria-pressed="status === 'paused'"
        @click="toggle"
      >
        <component :is="status === 'paused' ? Play : Pause" aria-hidden="true" />
      </Button>
    </div>
    <p class="mt-1 text-sm">
      <strong class="tabular-nums">{{ formatNumber(views) }}</strong>
      {{ views > 1 ? 'vues' : 'vue' }} sur les 30 dernières minutes
    </p>
    <!-- Flux non annoncé par les lecteurs d'écran : il les saturerait. -->
    <ol v-if="recent.length" class="mt-3 grid max-h-72 gap-2 overflow-y-auto text-sm">
      <li v-for="event in recent" :key="`${event.at}-${event.path}`" class="grid">
        <span class="text-muted-foreground tabular-nums">
          {{ formatTime(event.at) }} {{ event.kind === 'cv' ? 'CV' : 'Vue' }}
        </span>
        <span class="truncate" :title="event.path">{{ event.path }}</span>
      </li>
    </ol>
    <p v-else class="mt-3 text-sm text-muted-foreground">Aucun événement récent.</p>
  </section>
</template>
