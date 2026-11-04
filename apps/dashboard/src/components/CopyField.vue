<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import { ref } from 'vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{ value: string; label: string; multiline?: boolean }>()
const copied = ref(false)

async function copy() {
  await navigator.clipboard.writeText(props.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="flex items-start gap-2">
    <pre
      v-if="multiline"
      class="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 text-sm"
      :aria-label="label"
    ><code>{{ value }}</code></pre>
    <input
      v-else
      :value="value"
      :aria-label="label"
      readonly
      class="h-9 min-w-0 flex-1 rounded-md border bg-muted/50 px-3 font-mono text-sm leading-9"
      @focus="($event.target as HTMLInputElement).select()"
    />
    <!-- Nom complet : plusieurs boutons « Copier » se côtoient sur une même page. -->
    <Button type="button" variant="outline" :aria-label="`Copier : ${label}`" @click="copy">
      <component :is="copied ? Check : Copy" aria-hidden="true" />
      {{ copied ? 'Copié' : 'Copier' }}
    </Button>
    <span class="sr-only" aria-live="polite">{{ copied ? `${label} : copié` : '' }}</span>
  </div>
</template>
