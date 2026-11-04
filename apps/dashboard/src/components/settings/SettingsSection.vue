<script setup lang="ts">
defineProps<{ id: string; title: string; description?: string }>()
</script>

<template>
  <section :id="id" :aria-labelledby="`${id}-title`" class="min-w-0 scroll-mt-8 border-t pt-8">
    <h2 :id="`${id}-title`" class="text-lg font-semibold">{{ title }}</h2>
    <p v-if="description" class="mt-1 max-w-prose text-sm text-muted-foreground">
      {{ description }}
    </p>
    <div class="mt-4">
      <slot />
    </div>
  </section>
</template>
