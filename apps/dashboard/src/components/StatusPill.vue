<script setup lang="ts">
/** Pastille d'un statut de contenu (direction visuelle, « Statuts ») : le mot est toujours écrit,
 *  la couleur le confirme. */
export type StatusTone = 'published' | 'draft' | 'modified' | 'en' | 'scheduled'
defineProps<{ tone: StatusTone }>()

const TONES: Record<StatusTone, string> = {
  published: 'bg-status-published-tint text-status-published',
  draft: 'bg-status-draft-tint text-status-draft',
  modified: 'bg-status-modified-tint text-status-modified',
  en: 'bg-status-en-tint text-status-en',
  scheduled: 'bg-status-scheduled-tint text-status-scheduled',
}
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
      TONES[tone],
    ]"
  >
    <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
    <slot />
  </span>
</template>
