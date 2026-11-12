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
import DailyChart from './DailyChart.vue'

defineProps<{ daily: Summary['daily'] }>()

const showTable = ref(false)
</script>

<template>
  <section aria-labelledby="daily-title" class="overflow-hidden rounded-lg border bg-card">
    <div class="flex items-center justify-between border-b py-2 pr-2 pl-4">
      <h2 id="daily-title" class="font-semibold">Par jour</h2>
      <Button
        variant="ghost"
        size="sm"
        class="text-primary"
        :aria-expanded="showTable"
        @click="showTable = !showTable"
      >
        {{ showTable ? 'Voir en graphique' : 'Voir en tableau' }}
      </Button>
    </div>
    <!-- Alternative accessible au graphique : les mêmes valeurs, jour par jour. -->
    <Table v-if="showTable">
      <TableHeader class="bg-canvas">
        <TableRow>
          <TableHead class="pl-4">Jour</TableHead>
          <TableHead class="text-right">Vues</TableHead>
          <TableHead class="text-right">CV</TableHead>
          <TableHead class="pr-4 text-right">Taux</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="day in daily" :key="day.date">
          <TableCell class="pl-4">{{ formatDay(day.date) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(day.views) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(day.cvs) }}</TableCell>
          <TableCell class="pr-4 text-right tabular-nums">
            {{ formatShare(day.cvs, day.views) }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <DailyChart v-else :daily="daily" class="m-4 mb-2" />
  </section>
</template>
