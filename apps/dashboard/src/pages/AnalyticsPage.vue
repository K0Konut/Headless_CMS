<script setup lang="ts">
import { Download } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import DailySection from '@/components/analytics/DailySection.vue'
import FeaturedSection from '@/components/analytics/FeaturedSection.vue'
import LivePanel from '@/components/analytics/LivePanel.vue'
import PagesTable from '@/components/analytics/PagesTable.vue'
import PeriodPicker from '@/components/analytics/PeriodPicker.vue'
import ReferrersTable from '@/components/analytics/ReferrersTable.vue'
import StatTile from '@/components/analytics/StatTile.vue'
import FormError from '@/components/FormError.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { Summary } from '@/lib/analytics'
import { formatNumber, formatShare } from '@/lib/format'
import { periodFromQuery, today } from '@/lib/period'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()

const slug = computed(() => String(route.params.espace))
const period = computed(() => periodFromQuery(route.query))
const query = computed(() => `from=${period.value.from}&to=${period.value.to}`)

const summary = ref<Summary | null>(null)
const loading = ref(true)
const error = ref('')

let latest = 0
/** Seule la dernière requête lancée s'affiche : une réponse lente arrivée en retard
 *  (ancienne période, autre espace) est ignorée. */
async function load() {
  const request = ++latest
  loading.value = true
  error.value = ''
  try {
    const result = await api<Summary>(
      `/spaces/${encodeURIComponent(slug.value)}/analytics?${query.value}`,
    )
    if (request === latest) summary.value = result
  } catch {
    if (request === latest) error.value = 'Les statistiques n’ont pas pu être chargées.'
  } finally {
    if (request === latest) loading.value = false
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

const empty = computed(
  () => summary.value && summary.value.totals.views + summary.value.totals.cvs === 0,
)
const exportUrl = computed(
  () => `/api/spaces/${encodeURIComponent(slug.value)}/analytics/export.csv?${query.value}`,
)
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-4">
    <h1 class="text-2xl font-semibold tracking-tight">Analytics</h1>
    <div class="flex flex-wrap items-end gap-2">
      <PeriodPicker :period="period" />
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
          <DailySection :daily="summary.daily" />

          <div class="grid gap-8 xl:grid-cols-2">
            <PagesTable :pages="summary.pages" />
            <ReferrersTable :referrers="summary.referrers" />
          </div>
        </template>
      </template>

      <!-- Hors de la période choisie : le classement porte toujours sur 6 mois. -->
      <FeaturedSection
        v-if="summary?.hasEvents"
        :slug="slug"
        :is-super-admin="!!session.me?.user.isSuperAdmin"
      />
    </div>

    <LivePanel :slug="slug" class="self-start" @event="onLiveEvent" />
  </div>
</template>
