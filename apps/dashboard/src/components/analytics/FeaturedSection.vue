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

async function load() {
  error.value = ''
  try {
    summaries.value = await api<FeaturedSummary[]>(
      `/spaces/${encodeURIComponent(props.slug)}/analytics/featured`,
    )
  } catch (err) {
    error.value = errorMessage(err)
  }
}
watch(() => props.slug, load, { immediate: true })

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`)

function status(row: FeaturedSummary['rows'][number]) {
  if (row.featured)
    return row.forced ? 'Mis en avant (forcé)' : `Mis en avant · ${ordinal(row.rank!)}`
  if (row.rank) return ordinal(row.rank)
  if (row.forced) return 'Forcé, sans place'
  return `Pas assez de vues (${row.views}/${FEATURED_MIN_VIEWS})`
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
    class="min-w-0"
  >
    <h2 :id="`featured-${summary.type.slug}`" class="text-lg font-semibold">
      Mise en avant · {{ summary.type.name }}
      <span class="text-sm font-normal text-muted-foreground">sur les 6 derniers mois</span>
    </h2>
    <p v-if="!summary.rows.length" class="mt-2 text-sm text-muted-foreground">
      Aucune entrée publiée.
    </p>
    <template v-else>
      <Table class="mt-2">
        <TableHeader>
          <TableRow>
            <TableHead>Entrée</TableHead>
            <TableHead class="text-right">Vues</TableHead>
            <TableHead class="text-right">CV</TableHead>
            <TableHead class="text-right">Score</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in summary.rows" :key="row.id">
            <TableCell class="max-w-56 truncate font-medium">
              <RouterLink
                :to="`/espaces/${slug}/contenu/${summary.type.slug}/${row.id}`"
                class="hover:underline"
                >{{ row.title || 'Sans titre' }}</RouterLink
              >
            </TableCell>
            <TableCell class="text-right tabular-nums">{{ formatNumber(row.views) }}</TableCell>
            <TableCell class="text-right tabular-nums">{{ formatNumber(row.cv) }}</TableCell>
            <TableCell class="text-right tabular-nums">
              {{ row.score === null ? '—' : formatShare(row.cv, row.views) }}
            </TableCell>
            <TableCell :class="row.featured ? 'font-medium' : 'text-muted-foreground'">
              <Star
                v-if="row.featured"
                aria-hidden="true"
                class="mr-1 inline size-3.5 fill-current align-[-2px] text-primary"
              />{{ status(row) }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p v-if="summary.drawnPlaces" class="mt-2 text-sm text-muted-foreground">
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
