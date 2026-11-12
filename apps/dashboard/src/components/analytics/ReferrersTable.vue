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
import AnalyticsPanel from './AnalyticsPanel.vue'
import MagnitudeBar from './MagnitudeBar.vue'

const props = defineProps<{ referrers: { source: string; views: number }[] }>()
const total = computed(() => props.referrers.reduce((sum, r) => sum + r.views, 0))
// Les sources arrivent triées par vues décroissantes.
const maxViews = computed(() => props.referrers[0]?.views || 1)

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
  <AnalyticsPanel title="Provenances" title-id="referrers-title">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead class="text-right">Vues</TableHead>
          <TableHead class="text-right">Part</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="referrer in top" :key="referrer.source">
          <TableCell class="max-w-48">
            <span class="block truncate font-medium">{{ referrer.source }}</span>
            <MagnitudeBar :value="referrer.views" :max="maxViews" />
          </TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(referrer.views) }}</TableCell>
          <TableCell class="text-right text-muted-foreground tabular-nums">
            {{ formatShare(referrer.views, total) }}
          </TableCell>
        </TableRow>
        <TableRow v-if="others">
          <TableCell class="text-muted-foreground">{{ others.count }} autres sources</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(others.views) }}</TableCell>
          <TableCell class="text-right text-muted-foreground tabular-nums">
            {{ formatShare(others.views, total) }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </AnalyticsPanel>
</template>
