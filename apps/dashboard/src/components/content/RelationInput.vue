<script setup lang="ts">
import type { RelationField } from '@dashility/shared'
import { X } from '@lucide/vue'
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MoveButtons from '@/components/MoveButtons.vue'
import StatusPill from '@/components/StatusPill.vue'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { type EntrySummary, type TrashedEntry, moveItem } from '@/lib/content'
import { useContentStore } from '@/stores/content'

/** Saisie d'un champ Relation (V4, document UX « Dans l'éditeur ») : les entrées choisies en
 *  étiquettes, et une liste avec recherche des entrées de la collection cible. */
const props = defineProps<{ field: RelationField; id: string; label: string; error?: string }>()
const value = defineModel<unknown>()

const route = useRoute()
const space = computed(() => String(route.params.espace))
/** L'entrée en cours d'édition ne se relie pas à elle-même. */
const self = computed(() => route.params.entree)
const content = useContentStore()
const targetName = computed(
  () => content.types?.find((t) => t.slug === props.field.target)?.name ?? props.field.target,
)

const ids = computed<string[]>(() => (Array.isArray(value.value) ? value.value : []))
const entries = ref<EntrySummary[] | null>(null)
/** Entrées choisies qui sont dans la corbeille : affichées grisées. */
const trashed = ref<TrashedEntry[] | null>(null)
const loadError = ref('')

watch(
  () => [space.value, props.field.target],
  async () => {
    loadError.value = ''
    trashed.value = null
    try {
      const url = `/spaces/${encodeURIComponent(space.value)}/types/${encodeURIComponent(props.field.target)}/entries`
      entries.value = await api<EntrySummary[]>(url)
    } catch {
      loadError.value = `Les entrées de ${targetName.value} n’ont pas pu être chargées.`
    }
  },
  { immediate: true },
)

// Un identifiant absent de la liste est peut-être dans la corbeille, y compris après un
// changement de valeur (version restaurée) ; introuvable, il n'est pas affiché et part à la
// prochaine sauvegarde (architecture, « Lecture tolérante »). La corbeille est lue une fois.
watch(
  () => entries.value && ids.value.some((id) => !entries.value!.some((e) => e.id === id)),
  async (missing) => {
    if (!missing || trashed.value) return
    trashed.value = []
    try {
      trashed.value = await api<TrashedEntry[]>(`/spaces/${encodeURIComponent(space.value)}/trash`)
    } catch {
      // Sans la corbeille, ces identifiants restent simplement non affichés.
    }
  },
  { immediate: true },
)

const chosen = computed(() =>
  ids.value.flatMap((id) => {
    const entry = entries.value?.find((e) => e.id === id)
    if (entry) return [{ id, title: name(entry), draft: entry.status === 'draft', inTrash: false }]
    const gone = trashed.value?.find((e) => e.id === id)
    return gone ? [{ id, title: name(gone), draft: false, inTrash: true }] : []
  }),
)
const available = computed(
  () => entries.value?.filter((e) => e.id !== self.value && !ids.value.includes(e.id)) ?? [],
)
const name = (entry: { title: string }) => entry.title || 'Sans titre'

function add(id: unknown) {
  if (typeof id === 'string') value.value = props.field.multiple ? [...ids.value, id] : [id]
}
function remove(id: string) {
  value.value = ids.value.filter((i) => i !== id)
}
function move(index: number, delta: -1 | 1) {
  const next = [...ids.value]
  moveItem(next, index, delta)
  value.value = next
}
</script>

<template>
  <div class="grid gap-2">
    <ul v-if="chosen.length" class="flex flex-wrap gap-1.5" :aria-label="label">
      <li
        v-for="(entry, i) in chosen"
        :key="entry.id"
        class="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 pr-0.5 pl-2 text-sm [&_button]:size-6"
        :class="entry.inTrash && 'text-muted-foreground'"
      >
        {{ entry.title }}
        <StatusPill v-if="entry.draft" tone="draft">Brouillon</StatusPill>
        <span v-if="entry.inTrash" class="text-xs">(dans la corbeille)</span>
        <MoveButtons
          v-if="field.multiple && chosen.length > 1"
          :name="entry.title"
          :index="i"
          :length="chosen.length"
          @move="move(i, $event)"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-6"
          :aria-label="`Retirer « ${entry.title} »`"
          @click="remove(entry.id)"
        >
          <X aria-hidden="true" />
        </Button>
      </li>
    </ul>

    <p v-if="loadError" class="text-sm text-destructive">{{ loadError }}</p>
    <p v-else-if="entries && !entries.length" class="text-sm text-muted-foreground">
      Aucune entrée dans {{ targetName }}.
      <a
        :href="`/espaces/${space}/contenu/${field.target}`"
        target="_blank"
        class="underline underline-offset-4"
        >Ajouter dans {{ targetName }}<span class="sr-only"> (nouvel onglet)</span></a
      >
    </p>
    <ComboboxRoot
      v-else-if="field.multiple || !chosen.length"
      :model-value="null"
      open-on-click
      open-on-focus
      @update:model-value="add"
    >
      <ComboboxAnchor
        class="flex h-9 w-full max-w-sm items-center rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-destructive/20"
      >
        <ComboboxInput
          :id="id"
          class="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          :placeholder="entries ? `Ajouter : rechercher dans ${targetName}…` : 'Chargement…'"
          :aria-invalid="!!error || undefined"
          :aria-describedby="error ? `${id}-error` : undefined"
          :aria-label="`${label} : ajouter une entrée`"
        />
      </ComboboxAnchor>
      <ComboboxPortal>
        <ComboboxContent
          position="popper"
          :side-offset="4"
          class="z-50 max-h-64 w-(--reka-combobox-trigger-width) min-w-56 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <ComboboxViewport class="p-1">
            <ComboboxEmpty class="px-2 py-1.5 text-sm text-muted-foreground">
              Aucune entrée ne correspond
            </ComboboxEmpty>
            <ComboboxItem
              v-for="entry in available"
              :key="entry.id"
              :value="entry.id"
              :text-value="name(entry)"
              class="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent"
            >
              {{ name(entry) }}
              <StatusPill v-if="entry.status === 'draft'" tone="draft">Brouillon</StatusPill>
            </ComboboxItem>
          </ComboboxViewport>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>
    <p v-if="chosen.some((e) => e.draft)" class="text-sm text-muted-foreground">
      Les entrées en brouillon n’apparaissent pas sur le site.
    </p>
  </div>
</template>
