<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
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

/** 10 lignes, toutes à la demande. */
const LIMIT = 10
const showAll = ref(false)
const shown = computed(() => (showAll.value ? rows.value : rows.value.slice(0, LIMIT)))
const maxViews = computed(() => Math.max(1, ...props.pages.map((p) => p.views)))

function sortBy(key: Key) {
  descending.value = sortKey.value === key ? !descending.value : true
  sortKey.value = key
}
</script>

<template>
  <section aria-labelledby="pages-title" class="min-w-0 overflow-hidden rounded-lg border bg-card">
    <div class="flex items-baseline gap-2 border-b px-4 py-3">
      <h2 id="pages-title" class="font-semibold">Pages</h2>
      <p class="text-sm text-muted-foreground">
        {{
          pages.length >= 100
            ? 'les 100 pages les plus vues'
            : `${pages.length} ${pages.length > 1 ? 'pages vues' : 'page vue'}`
        }}
      </p>
    </div>
    <Table>
      <TableHeader class="bg-canvas">
        <TableRow>
          <TableHead class="pl-4">Page</TableHead>
          <SortableHead
            v-for="column in COLUMNS"
            :key="column.key"
            :label="column.label"
            :active="sortKey === column.key"
            :direction="descending ? 'descending' : 'ascending'"
            :class="column.key === 'rate' && 'pr-4'"
            @sort="sortBy(column.key)"
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="page in shown" :key="page.path">
          <TableCell class="max-w-64 pl-4">
            <span class="block truncate font-medium" :title="page.path">{{ page.path }}</span>
            <!-- Ordre de grandeur des vues, en plus du nombre. -->
            <span
              class="mt-1 block h-1 rounded-full bg-series-views/80"
              :style="{ width: `${(page.views / maxViews) * 100}%` }"
            />
          </TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(page.views) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(page.cvs) }}</TableCell>
          <TableCell class="pr-4 text-right text-muted-foreground tabular-nums">{{
            formatShare(page.cvs, page.views)
          }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <div v-if="pages.length > LIMIT" class="flex justify-center p-1.5">
      <Button variant="ghost" size="sm" class="text-primary" @click="showAll = !showAll">
        {{ showAll ? 'Afficher moins' : `Afficher les ${pages.length} pages` }}
      </Button>
    </div>
  </section>
</template>
