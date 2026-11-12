<script setup lang="ts">
/** Barre fine sous un libellé : l'ordre de grandeur de `value`, en plus du nombre. */
defineProps<{ value: number; max: number }>()
</script>

<template>
  <span
    class="mt-1 block h-1 rounded-full bg-series-views/80"
    :style="{ width: `${(value / max) * 100}%` }"
    aria-hidden="true"
  />
</template>
