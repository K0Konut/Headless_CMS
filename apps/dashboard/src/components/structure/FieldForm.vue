<script setup lang="ts">
import { type Field, TRANSLATABLE_FIELD_TYPES } from '@dashility/shared'
import { ChevronRight, Trash2 } from '@lucide/vue'
import { computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fieldKey } from '@/lib/content'
import { useContentStore } from '@/stores/content'
import FieldList from './FieldList.vue'

const props = defineProps<{
  idPrefix: string
  /** Version enregistrée du champ : s'il en a une, son identifiant, son type et sa traduction sont figés. */
  saved?: Field
}>()
const field = defineModel<Field>({ required: true })

const frozen = computed(() => !!props.saved)
/** Cibles possibles d'une relation : les collections de l'espace ouvert. */
const content = useContentStore()
const collections = computed(() => content.types?.filter((t) => t.kind === 'collection') ?? [])
const id = (name: string) => `${props.idPrefix}-${name}`

// L'identifiant suit le libellé tant qu'il est celui généré à partir de lui : modifié à la main,
// il ne bouge plus.
watch(
  () => field.value.label,
  (label, previous) => {
    if (!frozen.value && field.value.key === fieldKey(previous)) field.value.key = fieldKey(label)
  },
)

/** Champ numérique facultatif : vide = pas de valeur. */
function optionalInt(value: string | number) {
  const n = Number.parseInt(String(value), 10)
  return Number.isNaN(n) ? undefined : n
}

// Même règle pour l'identifiant d'un choix, qui suit son libellé français.
// Un choix enregistré garde son identifiant : les entrées et les sites le stockent.
const savedChoices = new WeakSet(
  props.saved?.type === 'choice' && field.value.type === 'choice' ? field.value.choices : [],
)
const savedChoiceKeys = props.saved?.type === 'choice' ? props.saved.choices.map((c) => c.key) : []
const isSavedChoice = (choice: { key: string; fr: string; en: string }) =>
  savedChoices.has(choice) && savedChoiceKeys.includes(choice.key)

function setChoiceLabel(choice: { key: string; fr: string; en: string }, fr: string) {
  if (!isSavedChoice(choice) && choice.key === fieldKey(choice.fr)) choice.key = fieldKey(fr)
  choice.fr = fr
}
</script>

<template>
  <div class="grid gap-4">
    <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div class="grid w-full max-w-xs gap-1.5">
        <Label :for="id('label')">Libellé</Label>
        <Input :id="id('label')" v-model="field.label" maxlength="100" />
      </div>
      <label class="flex h-9 items-center gap-2 text-sm">
        <input v-model="field.required" type="checkbox" class="size-4 accent-primary" />
        Obligatoire
      </label>
      <label
        v-if="TRANSLATABLE_FIELD_TYPES.includes(field.type)"
        class="flex h-9 items-center gap-2 text-sm"
      >
        <input
          v-model="field.translatable"
          type="checkbox"
          class="size-4 accent-primary"
          :disabled="frozen"
          :aria-describedby="frozen ? id('translatable-hint') : undefined"
        />
        Une valeur en français et une en anglais
        <span v-if="frozen" :id="id('translatable-hint')" class="text-muted-foreground">
          (figé)
        </span>
        <span v-else class="text-muted-foreground">(ne pourra plus être changé)</span>
      </label>
    </div>

    <fieldset v-if="field.type === 'choice'" class="grid gap-2">
      <legend class="mb-2 text-sm font-medium">Choix</legend>
      <div
        v-for="(choice, c) in field.choices"
        :key="c"
        class="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <div class="grid gap-1.5">
          <Label :for="id(`choice-${c}-fr`)">Libellé français</Label>
          <Input
            :id="id(`choice-${c}-fr`)"
            :model-value="choice.fr"
            @update:model-value="setChoiceLabel(choice, String($event))"
          />
        </div>
        <div class="grid gap-1.5">
          <Label :for="id(`choice-${c}-en`)" lang="en">Libellé anglais</Label>
          <Input :id="id(`choice-${c}-en`)" v-model="choice.en" lang="en" />
        </div>
        <div class="grid gap-1.5">
          <Label :for="id(`choice-${c}-key`)">Identifiant</Label>
          <Input
            :id="id(`choice-${c}-key`)"
            v-model="choice.key"
            :disabled="isSavedChoice(choice)"
            class="font-mono"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          :disabled="field.choices.length === 1"
          :aria-label="`Retirer le choix « ${choice.fr || c + 1} »`"
          @click="field.choices.splice(c, 1)"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="justify-self-start"
        @click="field.choices.push({ key: '', fr: '', en: '' })"
      >
        Ajouter un choix
      </Button>
    </fieldset>

    <div v-else-if="field.type === 'date'" class="flex flex-wrap gap-x-10 gap-y-4">
      <fieldset class="grid gap-2">
        <legend class="mb-1 text-sm font-medium">Saisie</legend>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="field.period" type="radio" :value="false" class="size-4 accent-primary" />
          Une date
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="field.period" type="radio" :value="true" class="size-4 accent-primary" />
          Une période, avec « en cours »
        </label>
      </fieldset>
      <fieldset class="grid gap-2">
        <legend class="mb-1 text-sm font-medium">Précision</legend>
        <label class="flex items-center gap-2 text-sm">
          <input
            v-model="field.precision"
            type="radio"
            value="month"
            class="size-4 accent-primary"
          />
          Mois et année
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="field.precision" type="radio" value="day" class="size-4 accent-primary" />
          Jour, mois et année
        </label>
      </fieldset>
    </div>

    <div v-else-if="field.type === 'group'" class="grid gap-4">
      <fieldset class="grid gap-2">
        <legend class="sr-only">Sous-champs de « {{ field.label || 'Sans libellé' }} »</legend>
        <p class="text-sm font-medium" aria-hidden="true">Sous-champs</p>
        <FieldList
          v-model="field.fields"
          :id-prefix="id('sub')"
          :saved="saved?.type === 'group' ? saved.fields : []"
          :top-level="false"
        />
      </fieldset>
    </div>

    <div v-else-if="field.type === 'relation'" class="flex flex-wrap gap-x-10 gap-y-4">
      <div class="grid w-full max-w-xs gap-1.5">
        <Label :for="id('target')">Collection cible</Label>
        <Select v-model="field.target" :disabled="frozen">
          <SelectTrigger :id="id('target')" :aria-describedby="id('target-hint')">
            <SelectValue placeholder="Choisir une collection" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="type in collections" :key="type.slug" :value="type.slug">
              {{ type.name }}
            </SelectItem>
          </SelectContent>
        </Select>
        <p :id="id('target-hint')" class="text-sm text-muted-foreground">
          {{ frozen ? 'Figée.' : 'Ne pourra plus être changée après l’enregistrement.' }}
        </p>
      </div>
      <fieldset class="grid gap-2">
        <legend class="mb-1 text-sm font-medium">Entrées</legend>
        <label class="flex items-center gap-2 text-sm">
          <input
            v-model="field.multiple"
            type="radio"
            :value="true"
            class="size-4 accent-primary"
          />
          Plusieurs
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input
            v-model="field.multiple"
            type="radio"
            :value="false"
            class="size-4 accent-primary"
          />
          Une seule
        </label>
      </fieldset>
    </div>

    <details class="group" :open="!!field.label && !field.key">
      <summary
        class="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <ChevronRight
          class="size-4 motion-safe:transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        Plus de réglages
      </summary>
      <div class="mt-3 flex flex-wrap items-start gap-x-6 gap-y-4">
        <div class="grid w-full max-w-xs gap-1.5">
          <Label :for="id('key')">Identifiant</Label>
          <Input
            :id="id('key')"
            v-model="field.key"
            :disabled="frozen"
            :aria-describedby="id('key-hint')"
            maxlength="50"
            class="font-mono"
          />
          <p :id="id('key-hint')" class="text-sm text-muted-foreground">
            {{
              frozen
                ? 'Figé : les entrées et les sites l’utilisent.'
                : 'Nom du champ dans l’API, généré depuis le libellé. Figé après l’enregistrement.'
            }}
          </p>
        </div>

        <div v-if="field.type === 'text'" class="grid max-w-48 gap-1.5">
          <Label :for="id('max')">Longueur maximale (facultatif)</Label>
          <Input
            :id="id('max')"
            type="number"
            min="1"
            max="10000"
            :model-value="field.maxLength ?? ''"
            @update:model-value="field.maxLength = optionalInt($event)"
          />
        </div>

        <label v-else-if="field.type === 'number'" class="flex h-9 items-center gap-2 text-sm">
          <input v-model="field.decimals" type="checkbox" class="size-4 accent-primary" />
          Décimales autorisées
        </label>

        <label v-else-if="field.type === 'boolean'" class="flex h-9 items-center gap-2 text-sm">
          <input v-model="field.defaultValue" type="checkbox" class="size-4 accent-primary" />
          « Oui » par défaut
        </label>

        <template v-else-if="field.type === 'group'">
          <div class="grid max-w-40 gap-1.5">
            <Label :for="id('min')">Éléments au minimum</Label>
            <Input
              :id="id('min')"
              type="number"
              min="0"
              max="100"
              :model-value="field.min ?? ''"
              @update:model-value="field.min = optionalInt($event)"
            />
          </div>
          <div class="grid max-w-40 gap-1.5">
            <Label :for="id('max')">Éléments au maximum</Label>
            <Input
              :id="id('max')"
              type="number"
              min="1"
              max="100"
              :model-value="field.max ?? ''"
              @update:model-value="field.max = optionalInt($event)"
            />
          </div>
        </template>
      </div>
    </details>
  </div>
</template>
