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
</script>

<template>
  <section aria-labelledby="referrers-title" class="min-w-0">
    <h2 id="referrers-title" class="text-lg font-semibold">Provenances</h2>
    <Table class="mt-2">
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead class="text-right">Vues</TableHead>
          <TableHead class="text-right">Part</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="referrer in referrers" :key="referrer.source">
          <TableCell class="max-w-48 truncate font-medium">{{ referrer.source }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(referrer.views) }}</TableCell>
          <TableCell class="text-right tabular-nums">
            {{ formatShare(referrer.views, total) }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </section>
</template>
