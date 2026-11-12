<script setup lang="ts">
import { FEATURED_MIN_VIEWS, type FeaturedSummary } from '@dashility/shared'
import { Star } from '@lucide/vue'
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import FormError from '@/components/FormError.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, errorMessage } from '@/lib/api'
import { formatNumber, formatShare } from '@/lib/format'

/** Classement des types mis en avant (document UX, « Analytics : le classement ») : toujours sur
 *  6 mois, quelle que soit la période choisie, puisque c'est la période du score. */
const props = defineProps<{ slug: string; isSuperAdmin: boolean }>()

const summaries = ref<FeaturedSummary[] | null>(null)
const error = ref('')

// Changement d'espace pendant un chargement : seule la dernière réponse compte.
let latest = 0
async function load() {
  const request = ++latest
  error.value = ''
  summaries.value = null
  try {
    const loaded = await api<FeaturedSummary[]>(
      `/spaces/${encodeURIComponent(props.slug)}/analytics/featured`,
    )
    if (request === latest) summaries.value = loaded
  } catch (err) {
    if (request === latest) error.value = errorMessage(err)
  }
}
watch(() => props.slug, load, { immediate: true })

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`)

/** Libellé d'une entrée mise en avant ; `null` pour les autres. */
function featuredLabel(row: FeaturedSummary['rows'][number]) {
  if (!row.featured) return null
  return row.forced ? 'Mis en avant (forcé)' : `Mis en avant · ${ordinal(row.rank!)}`
}
</script>

<template>
  <div v-if="error" class="grid justify-items-start gap-3">
    <FormError :message="error" />
    <Button variant="outline" @click="load">Réessayer</Button>
  </div>
  <Skeleton v-else-if="!summaries" class="h-40" />
  <p v-else-if="!summaries.length && isSuperAdmin" class="text-sm text-muted-foreground">
    Mettez en avant vos projets les plus efficaces : réglez la mise en avant d’une collection dans
    <RouterLink :to="`/espaces/${slug}/structure`" class="underline underline-offset-4"
      >Structure</RouterLink
    >.
  </p>
  <section
    v-for="summary in summaries"
    v-else
    :key="summary.type.slug"
    :aria-labelledby="`featured-${summary.type.slug}`"
    class="min-w-0 overflow-hidden rounded-lg border bg-card"
  >
    <div class="flex flex-wrap items-baseline gap-x-2 border-b px-4 py-3">
      <h2 :id="`featured-${summary.type.slug}`" class="font-semibold">
        Mise en avant · {{ summary.type.name }}
      </h2>
      <p class="text-sm text-muted-foreground">
        sur les 6 derniers mois, quelle que soit la période
      </p>
    </div>
    <p v-if="!summary.rows.length" class="px-4 py-3 text-sm text-muted-foreground">
      Aucune entrée publiée.
    </p>
    <template v-else>
      <Table>
        <TableHeader class="bg-canvas">
          <TableRow>
            <TableHead class="pl-4">Entrée</TableHead>
            <TableHead class="hidden text-right sm:table-cell">Vues</TableHead>
            <TableHead class="hidden text-right sm:table-cell">CV</TableHead>
            <TableHead class="text-right">Score</TableHead>
            <TableHead class="pr-4">Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in summary.rows" :key="row.id">
            <TableCell class="max-w-56 truncate pl-4 font-medium">
              <RouterLink
                :to="`/espaces/${slug}/contenu/${summary.type.slug}/${row.id}`"
                class="hover:underline"
                >{{ row.title || 'Sans titre' }}</RouterLink
              >
            </TableCell>
            <TableCell class="hidden text-right tabular-nums sm:table-cell">{{
              formatNumber(row.views)
            }}</TableCell>
            <TableCell class="hidden text-right tabular-nums sm:table-cell">{{
              formatNumber(row.cv)
            }}</TableCell>
            <TableCell class="text-right tabular-nums">
              {{ row.score === null ? '—' : formatShare(row.cv, row.views) }}
            </TableCell>
            <TableCell class="w-52 pr-4">
              <span
                v-if="featuredLabel(row)"
                class="inline-flex items-center gap-1 rounded-md bg-status-scheduled-tint px-2 py-0.5 text-[12.5px] font-medium text-status-scheduled"
              >
                <Star aria-hidden="true" class="size-3.5 fill-current" />{{ featuredLabel(row) }}
              </span>
              <span v-else-if="row.rank" class="text-muted-foreground">{{
                ordinal(row.rank)
              }}</span>
              <span v-else-if="row.forced" class="text-muted-foreground">Forcé, sans place</span>
              <span v-else class="grid gap-1 text-[12.5px] text-muted-foreground tabular-nums">
                Pas assez de vues : {{ row.views }} sur {{ FEATURED_MIN_VIEWS }}
                <span class="block h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    class="block h-full bg-muted-foreground/50"
                    :style="{ width: `${Math.min(100, (row.views / FEATURED_MIN_VIEWS) * 100)}%` }"
                  />
                </span>
              </span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p v-if="summary.drawnPlaces" class="border-t px-4 py-2.5 text-sm text-muted-foreground">
        {{
          summary.drawnPlaces === 1
            ? 'La place restante est tirée'
            : `Les ${summary.drawnPlaces} places restantes sont tirées`
        }}
        au hasard chaque jour, au build du site.
      </p>
    </template>
  </section>
</template>
