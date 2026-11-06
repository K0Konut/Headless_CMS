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
import type { Summary } from '@/lib/analytics'
import { formatDay, formatNumber } from '@/lib/format'
import DailyBars from './DailyBars.vue'

const props = defineProps<{ daily: Summary['daily'] }>()

const showTable = ref(false)
const viewDays = computed(() => props.daily.map((d) => ({ date: d.date, value: d.views })))
const cvDays = computed(() => props.daily.map((d) => ({ date: d.date, value: d.cvs })))
</script>

<template>
  <section aria-labelledby="daily-title" class="grid gap-4">
    <div class="flex items-center justify-between">
      <h2 id="daily-title" class="text-lg font-semibold">Par jour</h2>
      <Button variant="ghost" size="sm" :aria-expanded="showTable" @click="showTable = !showTable">
        {{ showTable ? 'Voir en graphique' : 'Voir en tableau' }}
      </Button>
    </div>
    <!-- Alternative accessible aux graphiques : les mêmes valeurs, jour par jour. -->
    <Table v-if="showTable">
      <TableHeader>
        <TableRow>
          <TableHead>Jour</TableHead>
          <TableHead class="text-right">Vues</TableHead>
          <TableHead class="text-right">CV</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="day in daily" :key="day.date">
          <TableCell>{{ formatDay(day.date) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(day.views) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatNumber(day.cvs) }}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <template v-else>
      <DailyBars title="Vues" :days="viewDays" color="var(--series-views)" />
      <DailyBars title="CV téléchargés" :days="cvDays" color="var(--series-cvs)" />
    </template>
  </section>
</template>
