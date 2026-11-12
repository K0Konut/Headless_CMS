<script setup lang="ts">
import { computed } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber, formatShare } from '@/lib/format'

const props = defineProps<{ referrers: { source: string; views: number }[] }>()
const total = computed(() => props.referrers.reduce((sum, r) => sum + r.views, 0))
const maxViews = computed(() => Math.max(1, ...props.referrers.map((r) => r.views)))

/** Les 5 premières sources, le reste regroupé sur une ligne. */
const LIMIT = 5
const top = computed(() =>
  props.referrers.length > LIMIT + 1 ? props.referrers.slice(0, LIMIT) : props.referrers,
)
const others = computed(() => {
  const rest = props.referrers.slice(top.value.length)
  return rest.length
    ? { count: rest.length, views: rest.reduce((sum, r) => sum + r.views, 0) }
    : null
})
</script>

<template>
  <section
    aria-labelledby="referrers-title"
    class="min-w-0 overflow-hidden rounded-lg border bg-card"
  >
    <h2 id="referrers-title" class="border-b px-4 py-3 font-semibold">Provenances</h2>
    <Table>
      <TableHeader class="bg-canvas">
        <TableRow>
          <TableHead class="pl-4">Source</TableHead>
          <TableHead class="text-right">Vues</TableHead>
          <TableHead class="pr-4 text-right">Part</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="referrer in top" :key="referrer.source">
          <TableCell class="max-w-48 pl-4">
            <span class="block truncate font-medium">{{ referrer.source }}</span>
            <span
              class="mt-1 block h-1 rounded-full bg-series-views/80"
              :style="{ width: `${(referrer.views / maxViews) * 100}%` }"
            />
          </TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(referrer.views) }}</TableCell>
          <TableCell class="pr-4 text-right text-muted-foreground tabular-nums">
            {{ formatShare(referrer.views, total) }}
          </TableCell>
        </TableRow>
        <TableRow v-if="others">
          <TableCell class="pl-4 text-muted-foreground">
            {{ others.count }} autres sources
          </TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(others.views) }}</TableCell>
          <TableCell class="pr-4 text-right text-muted-foreground tabular-nums">
            {{ formatShare(others.views, total) }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </section>
</template>
