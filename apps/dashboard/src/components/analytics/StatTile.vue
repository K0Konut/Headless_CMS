<script setup lang="ts">
import { ArrowDown, ArrowUp } from '@lucide/vue'
import type { formatChange } from '@/lib/format'

defineProps<{
  label: string
  value: string
  /** Couleur de la série dans le graphique (variable CSS). */
  color?: string
  /** Valeur de la période précédente (« 1 012 avant ») ; sans elle, pas d'évolution. */
  before?: string | null
  change?: ReturnType<typeof formatChange>
}>()
</script>

<template>
  <div class="rounded-lg border bg-card px-4 py-3">
    <dt class="flex items-center gap-2 text-sm text-muted-foreground">
      <span v-if="color" class="size-2 rounded-[2px]" :style="{ background: color }" />{{ label }}
    </dt>
    <dd class="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{{ value }}</dd>
    <!-- La flèche et le signe portent le sens, la couleur le confirme. -->
    <dd
      v-if="before"
      class="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground tabular-nums"
    >
      <span
        v-if="change"
        class="inline-flex items-center gap-0.5 font-semibold"
        :class="
          change.sign > 0 ? 'text-status-published' : change.sign < 0 ? 'text-trend-down' : ''
        "
      >
        <ArrowUp v-if="change.sign > 0" class="size-3.5" aria-hidden="true" />
        <ArrowDown v-else-if="change.sign < 0" class="size-3.5" aria-hidden="true" />{{
          change.text
        }}
      </span>
      {{ before }}
    </dd>
  </div>
</template>
