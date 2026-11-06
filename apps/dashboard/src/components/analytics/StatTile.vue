<script setup lang="ts">
defineProps<{ label: string; value: string }>()
</script>

<template>
  <div class="rounded-lg border bg-card px-4 py-3">
    <dt class="text-sm text-muted-foreground">{{ label }}</dt>
    <dd class="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{{ value }}</dd>
  </div>
</template>
