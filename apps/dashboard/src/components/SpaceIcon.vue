<script setup lang="ts">
import { ref, watch, type HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

/** Favicon du site d'un espace (`<site>/favicon.ico`), sinon l'initiale de son nom.
 *  Décoratif : le nom de l'espace est toujours écrit à côté. */
const props = defineProps<{ siteUrl: string; name: string; class?: HTMLAttributes['class'] }>()

const failed = ref(false)
watch(
  () => props.siteUrl,
  () => (failed.value = false),
)
</script>

<template>
  <span
    :class="
      cn(
        'flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm text-[0.625rem] font-semibold',
        failed && 'bg-muted text-muted-foreground',
        props.class,
      )
    "
    aria-hidden="true"
  >
    <img
      v-if="!failed"
      :src="`${siteUrl}/favicon.ico`"
      alt=""
      class="size-full object-contain"
      @error="failed = true"
    />
    <template v-else>{{ [...name][0]?.toUpperCase() }}</template>
  </span>
</template>
