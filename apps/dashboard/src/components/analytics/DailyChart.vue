<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'
import type { Summary } from '@/lib/analytics'
import { formatDay, formatNumber, formatShare } from '@/lib/format'

/** Vues en courbe, CV en barres dessous, sur les mêmes dates : deux échelles trop différentes pour
 *  un seul axe. Un curseur commun, à la souris ou aux flèches, lit les deux. */
const props = defineProps<{ daily: Summary['daily'] }>()

const box = useTemplateRef('box')
const { width } = useElementSize(box)
const active = ref<number | null>(null)

const LEFT = 32
const RIGHT = 8
const V_TOP = 34
const V_H = 150
const C_TOP = V_TOP + V_H + 40
const C_H = 56
const HEIGHT = C_TOP + C_H + 24
const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })

/** 96 → 100, 37 → 40, 7 → 7 : un maximum rond pour l'axe. */
function roundMax(value: number) {
  const step = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / step) * step
}

const chart = computed(() => {
  const days = props.daily
  const w = Math.max(width.value, 200)
  const step = (w - LEFT - RIGHT) / days.length
  const x = (i: number) => LEFT + step * (i + 0.5)
  const vMax = roundMax(Math.max(1, ...days.map((d) => d.views)))
  const cMax = Math.max(1, ...days.map((d) => d.cvs))
  const vy = (v: number) => V_TOP + V_H - (v / vMax) * V_H
  const cy = (v: number) => C_TOP + C_H - (v / cMax) * C_H

  const line = days.map((d, i) => `${x(i)},${vy(d.views)}`).join(' ')
  const area = `${x(0)},${vy(0)} ${line} ${x(days.length - 1)},${vy(0)}`

  const bw = Math.max(1, Math.min(14, step - 3))
  const r = bw >= 6 ? 3 : 0
  const bars = days.flatMap((d, i) =>
    d.cvs
      ? [
          `M${x(i) - bw / 2},${cy(0)} V${cy(d.cvs) + r} q0,-${r} ${r},-${r} h${bw - 2 * r} q${r},0 ${r},${r} V${cy(0)} Z`,
        ]
      : [],
  )

  // Repères de dates : chaque jour sur une semaine, les lundis sur un mois, le 1er au-delà ;
  // un repère trop proche du précédent est sauté.
  const dates: { x: number; label: string }[] = []
  days.forEach((d, i) => {
    const date = new Date(`${d.date}T00:00:00Z`)
    const candidate =
      days.length <= 7 || (days.length <= 31 ? date.getUTCDay() === 1 : date.getUTCDate() === 1)
    const last = dates[dates.length - 1]
    if (candidate && (!last || x(i) - last.x >= 64))
      dates.push({ x: x(i), label: formatDay(d.date) })
  })

  const peakIndex = days.reduce((best, d, i) => (d.views > days[best]!.views ? i : best), 0)
  const peak = days[peakIndex]!.views
    ? {
        x: x(peakIndex),
        y: vy(days[peakIndex]!.views) - 9,
        anchor:
          peakIndex < days.length * 0.15
            ? 'start'
            : peakIndex > days.length * 0.85
              ? 'end'
              : 'middle',
        label: `${formatNumber(days[peakIndex]!.views)} · ${formatDay(days[peakIndex]!.date)}`,
      }
    : null

  return {
    w,
    step,
    x,
    vy,
    cy,
    line,
    area,
    bars,
    dates,
    peak,
    vTicks: vMax % 2 ? [0, vMax] : [0, vMax / 2, vMax],
    cMax,
  }
})

const tip = computed(() => {
  if (active.value === null) return null
  const day = props.daily[active.value]!
  const x = chart.value.x(active.value)
  // Le cadre passe à gauche du curseur près du bord droit.
  return { day, x, left: x + 12 + 176 > chart.value.w ? x - 12 - 176 : x + 12 }
})

function onMove(event: MouseEvent) {
  const left = (event.currentTarget as Element).getBoundingClientRect().left
  const i = Math.floor((event.clientX - left - LEFT) / chart.value.step)
  active.value = Math.max(0, Math.min(props.daily.length - 1, i))
}

function onKey(event: KeyboardEvent) {
  const last = props.daily.length - 1
  const moves: Record<string, number> = {
    ArrowLeft: Math.max(0, (active.value ?? last + 1) - 1),
    ArrowRight: Math.min(last, (active.value ?? -1) + 1),
    Home: 0,
    End: last,
  }
  if (event.key === 'Escape') active.value = null
  else if (event.key in moves) active.value = moves[event.key]!
  else return
  event.preventDefault()
}
</script>

<template>
  <div
    ref="box"
    class="relative rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    tabindex="0"
    role="group"
    aria-label="Vues et CV téléchargés par jour. Flèches gauche et droite pour parcourir les jours."
    @keydown="onKey"
    @blur="active = null"
  >
    <svg
      :viewBox="`0 0 ${chart.w} ${HEIGHT}`"
      :height="HEIGHT"
      class="block w-full overflow-visible text-xs"
      aria-hidden="true"
      @mousemove="onMove"
      @mouseleave="active = null"
    >
      <text x="0" :y="V_TOP - 10" class="fill-foreground text-[13px] font-semibold">Vues</text>
      <g v-for="t in chart.vTicks" :key="t">
        <line
          :x1="LEFT"
          :x2="chart.w - RIGHT"
          :y1="chart.vy(t)"
          :y2="chart.vy(t)"
          :class="t ? 'stroke-border/60' : 'stroke-border'"
        />
        <text :x="LEFT - 8" :y="chart.vy(t) + 4" text-anchor="end" class="fill-muted-foreground">
          {{ formatNumber(t) }}
        </text>
      </g>
      <polygon :points="chart.area" fill="var(--series-views)" opacity="0.1" />
      <polyline
        :points="chart.line"
        fill="none"
        stroke="var(--series-views)"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <text
        v-if="chart.peak && active === null"
        :x="chart.peak.x"
        :y="chart.peak.y"
        :text-anchor="chart.peak.anchor"
        class="fill-foreground font-semibold"
      >
        {{ chart.peak.label }}
      </text>

      <text x="0" :y="C_TOP - 12" class="fill-foreground text-[13px] font-semibold">
        CV téléchargés
      </text>
      <g v-for="t in [0, chart.cMax]" :key="t">
        <line
          :x1="LEFT"
          :x2="chart.w - RIGHT"
          :y1="chart.cy(t)"
          :y2="chart.cy(t)"
          :class="t ? 'stroke-border/60' : 'stroke-border'"
        />
        <text :x="LEFT - 8" :y="chart.cy(t) + 4" text-anchor="end" class="fill-muted-foreground">
          {{ formatNumber(t) }}
        </text>
      </g>
      <path v-for="(d, i) in chart.bars" :key="i" :d="d" fill="var(--series-cvs)" />

      <text
        v-for="d in chart.dates"
        :key="d.label"
        :x="d.x"
        :y="HEIGHT - 6"
        text-anchor="middle"
        class="fill-muted-foreground"
      >
        {{ d.label }}
      </text>

      <template v-if="tip">
        <line :x1="tip.x" :x2="tip.x" :y1="V_TOP" :y2="C_TOP + C_H" class="stroke-foreground/35" />
        <circle
          :cx="tip.x"
          :cy="chart.vy(tip.day.views)"
          r="4.5"
          fill="var(--series-views)"
          class="stroke-card"
          stroke-width="2"
        />
      </template>
    </svg>

    <div
      v-if="tip"
      class="pointer-events-none absolute top-7 z-10 w-44 rounded-md border bg-popover px-2.5 py-2 text-sm tabular-nums"
      :style="{ left: `${tip.left}px` }"
      aria-live="polite"
    >
      <p class="mb-1 font-semibold">
        {{ weekday.format(new Date(`${tip.day.date}T00:00:00Z`)) }} {{ formatDay(tip.day.date) }}
      </p>
      <p class="flex justify-between">
        <span class="inline-flex items-center gap-1.5 text-muted-foreground">
          <span class="size-2 rounded-[2px] bg-series-views" />Vues
        </span>
        {{ formatNumber(tip.day.views) }}
      </p>
      <p class="flex justify-between">
        <span class="inline-flex items-center gap-1.5 text-muted-foreground">
          <span class="size-2 rounded-[2px] bg-series-cvs" />CV
        </span>
        {{ formatNumber(tip.day.cvs) }}
      </p>
      <p class="flex justify-between">
        <span class="text-muted-foreground">Taux</span>
        {{ formatShare(tip.day.cvs, tip.day.views) }}
      </p>
    </div>
  </div>
</template>
