<script setup lang="ts">
import { Download } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import DailyBars from '@/components/analytics/DailyBars.vue'
import LivePanel from '@/components/analytics/LivePanel.vue'
import PagesTable from '@/components/analytics/PagesTable.vue'
import ReferrersTable from '@/components/analytics/ReferrersTable.vue'
import StatTile from '@/components/analytics/StatTile.vue'
import FormError from '@/components/FormError.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import type { Summary } from '@/lib/analytics'
import { formatDay, formatNumber, formatShare } from '@/lib/format'
import { PRESETS, oldestDate, periodFromQuery, today } from '@/lib/period'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const slug = computed(() => String(route.params.espace))
const period = computed(() => periodFromQuery(route.query))
const query = computed(() => `from=${period.value.from}&to=${period.value.to}`)

const summary = ref<Summary | null>(null)
const loading = ref(true)
const error = ref('')
const showTable = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    summary.value = await api<Summary>(
      `/spaces/${encodeURIComponent(slug.value)}/analytics?${query.value}`,
    )
  } catch {
    error.value = 'Les statistiques n’ont pas pu être chargées.'
  } finally {
    loading.value = false
  }
}
watch([slug, query], load, { immediate: true })

/** Un événement en direct met à jour la période si elle inclut aujourd'hui (et remplace l'état
 *  vide au premier événement). Au plus un rechargement toutes les 2 s pendant un afflux. */
let refresh: ReturnType<typeof setTimeout> | undefined
function onLiveEvent() {
  if (refresh || period.value.to !== today()) return
  refresh = setTimeout(() => {
    refresh = undefined
    void load()
  }, 2000)
}
onBeforeUnmount(() => clearTimeout(refresh))

function setPreset(value: unknown) {
  if (value === 'custom') {
    const { from, to } = period.value
    return router.replace({ query: { du: from, au: to } })
  }
  return router.replace({ query: { periode: String(value) } })
}
function setDates(from: string, to: string) {
  if (from && to && from <= to) void router.replace({ query: { du: from, au: to } })
}

const empty = computed(
  () => summary.value && summary.value.totals.views + summary.value.totals.cvs === 0,
)
const exportUrl = computed(
  () => `/api/spaces/${encodeURIComponent(slug.value)}/analytics/export.csv?${query.value}`,
)
const viewDays = computed(
  () => summary.value?.daily.map((d) => ({ date: d.date, value: d.views })) ?? [],
)
const cvDays = computed(
  () => summary.value?.daily.map((d) => ({ date: d.date, value: d.cvs })) ?? [],
)
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-4">
    <h1 class="text-2xl font-semibold tracking-tight">Analytics</h1>
    <div class="flex flex-wrap items-end gap-2">
      <div class="grid gap-1.5">
        <Label for="periode">Période</Label>
        <Select :model-value="period.preset" @update:model-value="setPreset">
          <SelectTrigger id="periode" class="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="p in PRESETS" :key="p.value" :value="p.value">{{
              p.label
            }}</SelectItem>
            <SelectItem value="custom">Personnalisée</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <template v-if="period.preset === 'custom'">
        <div class="grid gap-1.5">
          <Label for="du">Du</Label>
          <Input
            id="du"
            type="date"
            class="w-40"
            :min="oldestDate()"
            :max="period.to"
            :model-value="period.from"
            @change="setDates(($event.target as HTMLInputElement).value, period.to)"
          />
        </div>
        <div class="grid gap-1.5">
          <Label for="au">Au</Label>
          <Input
            id="au"
            type="date"
            class="w-40"
            :min="period.from"
            :max="today()"
            :model-value="period.to"
            @change="setDates(period.from, ($event.target as HTMLInputElement).value)"
          />
        </div>
      </template>
      <Button as-child variant="outline">
        <a :href="exportUrl" download><Download aria-hidden="true" />Exporter en CSV</a>
      </Button>
    </div>
  </div>

  <div class="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="grid min-w-0 content-start gap-8">
      <div v-if="error" class="grid justify-items-start gap-3">
        <FormError :message="error" />
        <Button variant="outline" @click="load">Réessayer</Button>
      </div>

      <template v-else-if="loading && !summary">
        <div class="grid gap-3 sm:grid-cols-3">
          <Skeleton v-for="i in 3" :key="i" class="h-24" />
        </div>
        <Skeleton class="h-64" />
      </template>

      <div v-else-if="summary && !summary.hasEvents" class="rounded-lg border border-dashed p-6">
        <h2 class="font-semibold">Aucune donnée pour l’instant</h2>
        <p v-if="session.me?.user.isSuperAdmin" class="mt-1 text-sm text-muted-foreground">
          Installez le script de collecte sur le site depuis
          <RouterLink
            :to="`/espaces/${slug}/reglages#integration`"
            class="underline underline-offset-4"
          >
            Réglages › Intégration</RouterLink
          >. Les statistiques apparaîtront ici dès la première visite.
        </p>
        <p v-else class="mt-1 text-sm text-muted-foreground">
          Le script de collecte n’est pas encore installé sur le site. Les statistiques apparaîtront
          ici dès la première visite.
        </p>
      </div>

      <template v-else-if="summary">
        <dl class="grid gap-3 sm:grid-cols-3" :aria-busy="loading">
          <StatTile label="Vues" :value="formatNumber(summary.totals.views)" />
          <StatTile label="CV téléchargés" :value="formatNumber(summary.totals.cvs)" />
          <StatTile label="Taux" :value="formatShare(summary.totals.cvs, summary.totals.views)" />
        </dl>

        <p v-if="empty" class="text-muted-foreground">Aucune visite sur cette période.</p>

        <template v-else>
          <section aria-labelledby="daily-title" class="grid gap-4">
            <div class="flex items-center justify-between">
              <h2 id="daily-title" class="text-lg font-semibold">Par jour</h2>
              <Button
                variant="ghost"
                size="sm"
                :aria-expanded="showTable"
                @click="showTable = !showTable"
              >
                {{ showTable ? 'Voir en graphique' : 'Voir en tableau' }}
              </Button>
            </div>
            <Table v-if="showTable">
              <TableHeader>
                <TableRow>
                  <TableHead>Jour</TableHead>
                  <TableHead class="text-right">Vues</TableHead>
                  <TableHead class="text-right">CV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="day in summary.daily" :key="day.date">
                  <TableCell>{{ formatDay(day.date) }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{
                    formatNumber(day.views)
                  }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{ formatNumber(day.cvs) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <template v-else>
              <DailyBars title="Vues" :days="viewDays" color="var(--series-views)" />
              <DailyBars title="CV téléchargés" :days="cvDays" color="var(--series-cvs)" />
            </template>
          </section>

          <div class="grid gap-8 xl:grid-cols-2">
            <PagesTable :pages="summary.pages" />
            <ReferrersTable :referrers="summary.referrers" />
          </div>
        </template>
      </template>
    </div>

    <LivePanel :slug="slug" class="self-start" @event="onLiveEvent" />
  </div>
</template>
