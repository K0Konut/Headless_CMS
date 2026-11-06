<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Counts } from '@/lib/analytics'
import { formatNumber, formatShare } from '@/lib/format'
import SortableHead from './SortableHead.vue'

const props = defineProps<{ pages: (Counts & { path: string })[] }>()

type Key = 'views' | 'cvs' | 'rate'
const COLUMNS: { key: Key; label: string }[] = [
  { key: 'views', label: 'Vues' },
  { key: 'cvs', label: 'CV' },
  { key: 'rate', label: 'Taux' },
]
const sortKey = ref<Key>('views')
const descending = ref(true)

const value = (p: Counts, key: Key) => (key === 'rate' ? (p.views ? p.cvs / p.views : 0) : p[key])
const rows = computed(() =>
  [...props.pages].sort((a, b) => {
    const diff = value(a, sortKey.value) - value(b, sortKey.value)
    return (descending.value ? -diff : diff) || a.path.localeCompare(b.path)
  }),
)

function sortBy(key: Key) {
  descending.value = sortKey.value === key ? !descending.value : true
  sortKey.value = key
}
</script>

<template>
  <section aria-labelledby="pages-title" class="min-w-0">
    <h2 id="pages-title" class="text-lg font-semibold">Pages</h2>
    <p v-if="pages.length >= 100" class="mt-1 text-sm text-muted-foreground">
      Les 100 pages les plus vues de la période.
    </p>
    <Table class="mt-2">
      <TableHeader>
        <TableRow>
          <TableHead>Page</TableHead>
          <SortableHead
            v-for="column in COLUMNS"
            :key="column.key"
            :label="column.label"
            :active="sortKey === column.key"
            :direction="descending ? 'descending' : 'ascending'"
            @sort="sortBy(column.key)"
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="page in rows" :key="page.path">
          <TableCell class="max-w-64 truncate font-medium" :title="page.path">{{
            page.path
          }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(page.views) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(page.cvs) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{
            formatShare(page.cvs, page.views)
          }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </section>
</template>
