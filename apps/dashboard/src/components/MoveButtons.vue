<script setup lang="ts">
import { ArrowDown, ArrowUp } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/** Boutons « Monter » et « Descendre » d'un élément de liste : l'alternative au glisser-déposer
 *  (document UX, « Accessibilité »). */
defineProps<{ name: string; index: number; length: number; disabled?: boolean }>()
defineEmits<{ move: [delta: -1 | 1] }>()
</script>

<template>
  <Button
    type="button"
    variant="ghost"
    size="icon"
    :disabled="disabled || index === 0"
    :aria-label="`Monter « ${name} »`"
    @click="$emit('move', -1)"
  >
    <ArrowUp aria-hidden="true" />
  </Button>
  <Button
    type="button"
    variant="ghost"
    size="icon"
    :disabled="disabled || index === length - 1"
    :aria-label="`Descendre « ${name} »`"
    @click="$emit('move', 1)"
  >
    <ArrowDown aria-hidden="true" />
  </Button>
</template>
