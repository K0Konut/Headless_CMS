<script setup lang="ts">
import type { EntryData, GroupField } from '@dashility/shared'
import { Trash2 } from '@lucide/vue'
import MoveButtons from '@/components/MoveButtons.vue'
import { Button } from '@/components/ui/button'
import { moveItem } from '@/lib/content'
import FieldRows from './FieldRows.vue'

/** Groupe répétable : des éléments communs aux deux langues, chacun avec ses sous-champs. */
const props = defineProps<{ field: GroupField; idPrefix: string; lang: 'fr' | 'en' }>()
const items = defineModel<EntryData[] | undefined>()

// Identifiant stable par élément : l'ordre peut changer.
const ids = new WeakMap<object, number>()
let lastId = 0
const idOf = (item: object) => ids.get(item) ?? (ids.set(item, ++lastId), lastId)

const list = () => items.value ?? []
function add() {
  items.value = [...list(), {}]
}
function remove(index: number) {
  items.value = list().filter((_, i) => i !== index)
}
function move(index: number, delta: -1 | 1) {
  const next = [...list()]
  moveItem(next, index, delta)
  items.value = next
}
const name = (index: number) => `${props.field.label} ${index + 1}`
</script>

<template>
  <div class="grid gap-3">
    <p v-if="!list().length" class="text-sm text-muted-foreground">Aucun élément.</p>
    <ol v-else class="grid gap-3">
      <li
        v-for="(item, i) in list()"
        :key="idOf(item)"
        class="rounded-lg border bg-card px-3"
        :aria-label="name(i)"
      >
        <div class="flex items-center gap-1 border-b py-2">
          <span class="flex-1 text-sm font-medium">{{ name(i) }}</span>
          <MoveButtons :name="name(i)" :index="i" :length="list().length" @move="move(i, $event)" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :aria-label="`Supprimer « ${name(i)} »`"
            @click="remove(i)"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
        <FieldRows
          v-model="items![i]!"
          :fields="field.fields"
          :id-prefix="`${idPrefix}-${i}`"
          :lang="lang"
        />
      </li>
    </ol>
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="justify-self-start"
      :disabled="field.max !== undefined && list().length >= field.max"
      @click="add"
    >
      Ajouter un élément à « {{ field.label }} »
    </Button>
  </div>
</template>
