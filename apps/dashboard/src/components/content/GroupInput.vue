<script setup lang="ts">
import { type EntryData, type GroupField, entryTitle } from '@dashility/shared'
import { ChevronDown, ChevronRight, Trash2 } from '@lucide/vue'
import { computed, inject, ref, toRaw, watch } from 'vue'
import MoveButtons from '@/components/MoveButtons.vue'
import { Button } from '@/components/ui/button'
import { READONLY_KEY, moveItem, stableIds } from '@/lib/content'
import FieldRows from './FieldRows.vue'

/** Groupe répétable : des éléments communs aux deux langues, chacun avec ses sous-champs.
 *  Les éléments sont repliés ; un élément ajouté ou signalé par la publication s'ouvre. */
const props = defineProps<{
  field: GroupField
  idPrefix: string
  lang: 'both' | 'fr' | 'en'
  /** Erreurs de publication de toute l'entrée, et le chemin de ce groupe (`steps.`). */
  errors?: Record<string, string>
  path: string
  /** Erreur du groupe lui-même (nombre d'éléments). */
  error?: string
}>()
const items = defineModel<EntryData[] | undefined>()

// Identifiant stable par élément : l'ordre peut changer. Par l'objet brut, pour reconnaître
// l'élément créé par `add` une fois relu à travers la réactivité.
const stableId = stableIds()
const idOf = (item: object) => stableId(toRaw(item))

const list = computed(() => items.value ?? [])

const opened = ref(new Set<number>())
// En lecture seule (publication programmée, aperçu de Structure), le bouton de repli est
// désactivé avec le reste : tout est déplié pour qu'on puisse lire.
const readonly = inject(READONLY_KEY, ref(false))
const isOpen = (item: object) => readonly.value || opened.value.has(idOf(item))
function toggle(item: object) {
  const id = idOf(item)
  if (!opened.value.delete(id)) opened.value.add(id)
}
// Un élément qui a une erreur de publication s'ouvre, pour qu'on la voie et que le focus l'atteigne.
// On suit la liste des éléments fautifs, pas l'objet des erreurs, recalculé à chaque frappe :
// un élément refermé ne se rouvre pas tant que ses erreurs ne changent pas.
watch(
  () =>
    list.value
      .filter((_, i) =>
        Object.keys(props.errors ?? {}).some((p) => p.startsWith(`${props.path}${i}.`)),
      )
      .map(idOf)
      .join(),
  (ids) => ids && ids.split(',').forEach((id) => opened.value.add(Number(id))),
  { immediate: true },
)
function add() {
  const item = {}
  items.value = [...list.value, item]
  opened.value.add(idOf(item))
}
function remove(index: number) {
  items.value = list.value.filter((_, i) => i !== index)
}
function move(index: number, delta: -1 | 1) {
  const next = [...list.value]
  moveItem(next, index, delta)
  items.value = next
}
const name = (index: number) => `${props.field.label} ${index + 1}`
const summary = (item: EntryData) => entryTitle(props.field.fields, item)
</script>

<template>
  <!-- Cible du focus quand la publication signale le groupe lui-même. -->
  <div
    :id="idPrefix"
    tabindex="-1"
    class="grid gap-3 outline-none"
    :aria-describedby="error ? `${idPrefix}-error` : undefined"
  >
    <p v-if="error" :id="`${idPrefix}-error`" class="text-sm text-destructive">{{ error }}</p>
    <p v-if="!list.length" class="text-sm text-muted-foreground">Aucun élément.</p>
    <ol v-else class="grid gap-3">
      <li
        v-for="(item, i) in list"
        :key="idOf(item)"
        class="rounded-lg border bg-card px-3"
        :aria-label="name(i)"
      >
        <div :class="['flex items-center gap-1 py-2', isOpen(item) && 'border-b']">
          <button
            type="button"
            class="-ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            :aria-expanded="isOpen(item)"
            :aria-controls="isOpen(item) ? `${idPrefix}-${i}-fields` : undefined"
            @click="toggle(item)"
          >
            <component
              :is="isOpen(item) ? ChevronDown : ChevronRight"
              class="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span class="shrink-0">{{ name(i) }}</span>
            <span v-if="summary(item)" class="truncate font-normal text-muted-foreground">
              · {{ summary(item) }}
            </span>
          </button>
          <MoveButtons :name="name(i)" :index="i" :length="list.length" @move="move(i, $event)" />
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
          v-if="isOpen(item)"
          :id="`${idPrefix}-${i}-fields`"
          v-model="items![i]!"
          :fields="field.fields"
          :id-prefix="`${idPrefix}-${i}`"
          :lang="lang"
          :errors="errors"
          :path="`${path}${i}.`"
        />
      </li>
    </ol>
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="justify-self-start"
      :disabled="field.max !== undefined && list.length >= field.max"
      @click="add"
    >
      Ajouter un élément à « {{ field.label }} »
    </Button>
  </div>
</template>
