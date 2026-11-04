<script setup lang="ts">
import { ArrowDown, ArrowUp } from '@lucide/vue'
import { TableHead } from '@/components/ui/table'

defineProps<{ label: string; active: boolean; direction: 'ascending' | 'descending' }>()
defineEmits<{ sort: [] }>()
</script>

<template>
  <TableHead class="text-right" :aria-sort="active ? direction : undefined">
    <button
      type="button"
      class="inline-flex items-center gap-1 rounded-sm hover:text-foreground"
      @click="$emit('sort')"
    >
      {{ label }}
      <component
        :is="direction === 'ascending' ? ArrowUp : ArrowDown"
        v-if="active"
        class="size-3.5"
        aria-hidden="true"
      />
    </button>
  </TableHead>
</template>
