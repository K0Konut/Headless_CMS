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
import AnalyticsPanel from './AnalyticsPanel.vue'
import MagnitudeBar from './MagnitudeBar.vue'
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
// Les pages arrivent triées par vues décroissantes.
const maxViews = computed(() => props.pages[0]?.views || 1)

function sortBy(key: Key) {
  descending.value = sortKey.value === key ? !descending.value : true
  sortKey.value = key
}
</script>

<template>
  <AnalyticsPanel title="Pages" title-id="pages-title">
    <template #note>
      {{
        pages.length >= 100
          ? 'les 100 pages les plus vues'
          : `${pages.length} ${pages.length > 1 ? 'pages vues' : 'page vue'}`
      }}
    </template>
    <Table>
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
        <TableRow v-for="page in shown" :key="page.path">
          <TableCell class="max-w-64">
            <span class="block truncate font-medium" :title="page.path">{{ page.path }}</span>
            <MagnitudeBar :value="page.views" :max="maxViews" />
          </TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(page.views) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(page.cvs) }}</TableCell>
          <TableCell class="text-right text-muted-foreground tabular-nums">{{
            formatShare(page.cvs, page.views)
          }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <div v-if="pages.length > LIMIT" class="flex justify-center border-t p-1.5">
      <Button variant="ghost" size="sm" class="text-primary" @click="showAll = !showAll">
        {{ showAll ? 'Afficher moins' : `Afficher les ${pages.length} pages` }}
      </Button>
    </div>
  </AnalyticsPanel>
</template>
