<script setup lang="ts">
import { FIELD_TYPES, type FieldType } from '@dashility/shared'
import { onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { FIELD_TYPE_HINTS, FIELD_TYPE_ICONS, FIELD_TYPE_LABELS } from '@/lib/content'

/** Premier temps de l'ajout d'un champ : choisir son type dans une grille (document UX,
 *  « Ajouter un champ, en deux temps »). */
const props = defineProps<{ idPrefix: string; topLevel: boolean }>()
const emit = defineEmits<{ pick: [FieldType]; cancel: [] }>()

// Groupe et relation ne se placent qu'au premier niveau d'un type (le schéma le refuse aussi).
const types = FIELD_TYPES.filter((t) => props.topLevel || (t !== 'group' && t !== 'relation'))
const list = ref<HTMLUListElement>()
onMounted(() => list.value?.querySelector('button')?.focus())
</script>

<template>
  <div
    role="group"
    :aria-labelledby="`${idPrefix}-picker-title`"
    class="grid gap-3 rounded-lg border bg-card p-4"
    @keydown.esc="emit('cancel')"
  >
    <div class="flex items-center gap-2">
      <p :id="`${idPrefix}-picker-title`" class="flex-1 font-medium">
        Quel genre d’information ce {{ topLevel ? 'champ' : 'sous-champ' }} contient-il ?
      </p>
      <Button type="button" variant="ghost" size="sm" @click="emit('cancel')">Annuler</Button>
    </div>
    <ul ref="list" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="t in types" :key="t">
        <button
          type="button"
          class="grid h-full w-full grid-cols-[1.875rem_minmax(0,1fr)] items-center gap-x-3 rounded-md border bg-card px-3 py-2.5 text-left outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          @click="emit('pick', t)"
        >
          <span
            class="row-span-2 grid size-7.5 place-items-center rounded-md bg-muted text-foreground/80"
            aria-hidden="true"
          >
            <component :is="FIELD_TYPE_ICONS[t]" class="size-4" />
          </span>
          <span class="font-medium">{{ FIELD_TYPE_LABELS[t] }}</span>
          <span class="text-sm text-muted-foreground">{{ FIELD_TYPE_HINTS[t] }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
