<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDay, formatNumber } from '@/lib/format'

const props = defineProps<{
  title: string
  /** Une valeur par jour, dans l'ordre. */
  days: { date: string; value: number }[]
  /** Couleur de la série (variable CSS). */
  color: string
}>()

const hovered = ref<number | null>(null)
const max = computed(() => Math.max(1, ...props.days.map((d) => d.value)))
const total = computed(() => props.days.reduce((sum, d) => sum + d.value, 0))
const tip = computed(() => (hovered.value === null ? null : props.days[hovered.value]))
</script>

<template>
  <figure>
    <figcaption class="flex items-baseline justify-between text-sm">
      <span class="font-medium">{{ title }}</span>
      <span class="text-muted-foreground tabular-nums">max. {{ formatNumber(max) }} / jour</span>
    </figcaption>
    <!-- Lecture accessible : le tableau « Voir en tableau » donne chaque valeur. -->
    <div
      class="relative mt-2 flex h-28 items-end border-b border-border"
      :class="days.length > 40 ? 'gap-px' : 'gap-0.5'"
      role="img"
      :aria-label="`${title} : ${formatNumber(total)} sur la période`"
      @mouseleave="hovered = null"
    >
      <div
        v-for="(day, i) in days"
        :key="day.date"
        class="flex h-full min-w-0 flex-1 items-end"
        @mouseenter="hovered = i"
      >
        <div
          class="w-full rounded-t-[4px] transition-opacity"
          :class="hovered !== null && hovered !== i ? 'opacity-40' : ''"
          :style="{
            height: `${(day.value / max) * 100}%`,
            minHeight: day.value ? '2px' : '0',
            background: color,
          }"
        />
      </div>
      <div
        v-if="tip"
        class="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-sm"
        :style="{ left: `${((hovered! + 0.5) / days.length) * 100}%` }"
      >
        {{ formatDay(tip.date) }} :
        <strong class="tabular-nums">{{ formatNumber(tip.value) }}</strong>
      </div>
    </div>
    <div class="mt-1 flex justify-between text-xs text-muted-foreground">
      <span>{{ formatDay(days[0]!.date) }}</span>
      <span>{{ formatDay(days[days.length - 1]!.date) }}</span>
    </div>
  </figure>
</template>
