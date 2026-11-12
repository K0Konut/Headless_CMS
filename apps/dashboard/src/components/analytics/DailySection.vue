<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Summary } from '@/lib/analytics'
import { formatDay, formatNumber, formatShare } from '@/lib/format'
import AnalyticsPanel from './AnalyticsPanel.vue'
import DailyChart from './DailyChart.vue'

defineProps<{ daily: Summary['daily'] }>()

const showTable = ref(false)
</script>

<template>
  <AnalyticsPanel title="Par jour" title-id="daily-title">
    <template #action>
      <Button
        variant="ghost"
        size="sm"
        class="text-primary"
        :aria-expanded="showTable"
        @click="showTable = !showTable"
      >
        {{ showTable ? 'Voir en graphique' : 'Voir en tableau' }}
      </Button>
    </template>
    <!-- Alternative accessible au graphique : les mêmes valeurs, jour par jour. -->
    <Table v-if="showTable">
      <TableHeader>
        <TableRow>
          <TableHead>Jour</TableHead>
          <TableHead class="text-right">Vues</TableHead>
          <TableHead class="text-right">CV</TableHead>
          <TableHead class="text-right">Taux</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="day in daily" :key="day.date">
          <TableCell>{{ formatDay(day.date) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(day.views) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(day.cvs) }}</TableCell>
          <TableCell class="text-right tabular-nums">
            {{ formatShare(day.cvs, day.views) }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <DailyChart v-else :daily="daily" class="m-4 mb-2" />
  </AnalyticsPanel>
</template>
