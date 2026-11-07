<script setup lang="ts">
import { type Field, isValidLink } from '@dashility/shared'
import { X } from '@lucide/vue'
import { computed, defineAsyncComponent, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ImageInput from './ImageInput.vue'
import PdfInput from './PdfInput.vue'

/** L'éditeur de texte riche (Tiptap, environ 300 Ko) n'est chargé qu'avec un champ qui l'utilise. */
const RichTextInput = defineAsyncComponent(() => import('./RichTextInput.vue'))

/** Saisie d'une valeur d'un champ simple, dans une langue. Le libellé est porté par `label`
 *  (« Titre (français) ») : la ligne du champ l'affiche une seule fois pour les deux langues. */
const props = defineProps<{
  field: Field
  id: string
  label: string
  lang?: 'fr' | 'en'
  /** Erreur signalée par une tentative de publication. */
  error?: string
}>()
const value = defineModel<unknown>()

const text = computed({
  get: () => (typeof value.value === 'string' ? value.value : ''),
  set: (v: string) => (value.value = v),
})
const linkError = computed(
  () => props.field.type === 'link' && !!text.value && !isValidLink(text.value),
)
/** Erreur affichée : celle de la publication, sinon un lien invalide, signalé dès la saisie. */
const shownError = computed(
  () =>
    props.error || (linkError.value ? 'Adresse invalide : elle doit commencer par https://' : ''),
)
const invalid = computed(() => !!shownError.value || undefined)
const describedby = computed(() => (shownError.value ? `${props.id}-error` : undefined))

const NONE = '__aucun'
const choice = computed({
  get: () => (typeof value.value === 'string' ? value.value : NONE),
  set: (v: string) => (value.value = v === NONE ? null : v),
})

type DateValue = { start?: string; end?: string; ongoing?: boolean }
const date = computed(() => (value.value ?? {}) as DateValue)
function setDate(change: Partial<DateValue>) {
  const next = { ...date.value, ...change }
  // Une période en cours n'a pas de fin.
  if (next.ongoing) delete next.end
  for (const key of ['start', 'end'] as const) if (!next[key]) delete next[key]
  if (!next.ongoing) delete next.ongoing
  value.value = next
}

const list = computed<string[]>(() => (Array.isArray(value.value) ? value.value : []))
const draftItem = ref('')
function addItem() {
  const item = draftItem.value.trim()
  if (item) value.value = [...list.value, item]
  draftItem.value = ''
}
</script>

<template>
  <div class="grid gap-1.5">
    <template v-if="field.type === 'text' || field.type === 'link'">
      <label :for="id" class="sr-only">{{ label }}</label>
      <Input
        :id="id"
        v-model="text"
        :type="field.type === 'link' ? 'url' : 'text'"
        :maxlength="field.type === 'text' ? field.maxLength : 2048"
        :lang="lang"
        :aria-invalid="invalid"
        :aria-describedby="describedby"
      />
    </template>

    <template v-else-if="field.type === 'number'">
      <label :for="id" class="sr-only">{{ label }}</label>
      <Input
        :id="id"
        type="number"
        :step="field.decimals ? 'any' : '1'"
        class="max-w-40"
        :aria-invalid="invalid"
        :aria-describedby="describedby"
        :model-value="typeof value === 'number' ? value : ''"
        @update:model-value="value = $event === '' ? null : Number($event)"
      />
    </template>

    <label v-else-if="field.type === 'boolean'" class="flex items-center gap-2 text-sm">
      <input
        :id="id"
        type="checkbox"
        class="size-4 accent-primary"
        :checked="(value as boolean | undefined) ?? field.defaultValue"
        @change="value = ($event.target as HTMLInputElement).checked"
      />
      Oui<span class="sr-only"> : {{ label }}</span>
    </label>

    <template v-else-if="field.type === 'choice'">
      <label :for="id" class="sr-only">{{ label }}</label>
      <Select v-model="choice">
        <SelectTrigger
          :id="id"
          class="w-full max-w-64"
          :aria-invalid="invalid"
          :aria-describedby="describedby"
          ><SelectValue
        /></SelectTrigger>
        <SelectContent>
          <SelectItem :value="NONE">Aucun</SelectItem>
          <SelectItem v-for="c in field.choices" :key="c.key" :value="c.key">{{ c.fr }}</SelectItem>
        </SelectContent>
      </Select>
    </template>

    <fieldset v-else-if="field.type === 'date'" class="flex flex-wrap items-center gap-2">
      <legend class="sr-only">{{ label }}</legend>
      <label :for="id" class="sr-only">{{ field.period ? 'Début' : label }}</label>
      <Input
        :id="id"
        :type="field.precision === 'month' ? 'month' : 'date'"
        class="w-44"
        :aria-invalid="invalid"
        :aria-describedby="describedby"
        :model-value="date.start ?? ''"
        @update:model-value="setDate({ start: String($event) })"
      />
      <template v-if="field.period">
        <span aria-hidden="true">→</span>
        <label :for="`${id}-end`" class="sr-only">Fin</label>
        <Input
          :id="`${id}-end`"
          :type="field.precision === 'month' ? 'month' : 'date'"
          class="w-44"
          :disabled="date.ongoing"
          :model-value="date.end ?? ''"
          @update:model-value="setDate({ end: String($event) })"
        />
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="size-4 accent-primary"
            :checked="!!date.ongoing"
            @change="setDate({ ongoing: ($event.target as HTMLInputElement).checked })"
          />
          en cours
        </label>
      </template>
    </fieldset>

    <div v-else-if="field.type === 'list'" class="grid gap-2">
      <ul v-if="list.length" class="flex flex-wrap gap-1.5" :aria-label="label">
        <li
          v-for="(item, i) in list"
          :key="i"
          class="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 pr-0.5 pl-2 text-sm"
          :lang="lang"
        >
          {{ item }}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-6"
            :aria-label="`Retirer « ${item} »`"
            @click="value = list.filter((_, j) => j !== i)"
          >
            <X aria-hidden="true" />
          </Button>
        </li>
      </ul>
      <label :for="id" class="sr-only">{{ label }} : nouvelle valeur</label>
      <Input
        :id="id"
        v-model="draftItem"
        :lang="lang"
        :aria-invalid="invalid"
        :aria-describedby="[`${id}-hint`, describedby].filter(Boolean).join(' ')"
        @keydown.enter.prevent="addItem"
        @blur="addItem"
      />
      <p :id="`${id}-hint`" class="text-sm text-muted-foreground">Entrée pour ajouter.</p>
    </div>

    <RichTextInput
      v-else-if="field.type === 'richtext'"
      :id="id"
      v-model="value"
      :label="label"
      :lang="lang"
      :invalid="invalid"
      :describedby="describedby"
    />

    <ImageInput
      v-else-if="field.type === 'image'"
      :id="id"
      v-model="value"
      :label="label"
      :error="error"
    />

    <PdfInput
      v-else-if="field.type === 'pdf'"
      :id="id"
      v-model="value"
      :label="label"
      :error="error"
    />

    <p
      v-if="shownError && field.type !== 'image' && field.type !== 'pdf'"
      :id="`${id}-error`"
      class="text-sm text-destructive"
    >
      {{ shownError }}
    </p>
  </div>
</template>
