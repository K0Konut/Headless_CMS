<script setup lang="ts">
import { type Field, TRANSLATABLE_FIELD_TYPES } from '@dashility/shared'
import { Trash2 } from '@lucide/vue'
import { computed, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fieldKey } from '@/lib/content'
import FieldList from './FieldList.vue'

const props = defineProps<{
  idPrefix: string
  /** Version enregistrée du champ : s'il en a une, son identifiant, son type et sa traduction sont figés. */
  saved?: Field
}>()
const field = defineModel<Field>({ required: true })

const frozen = computed(() => !!props.saved)
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
function setChoiceLabel(choice: { key: string; fr: string }, fr: string) {
  if (choice.key === fieldKey(choice.fr)) choice.key = fieldKey(fr)
  choice.fr = fr
}
</script>

<template>
  <div class="grid gap-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="grid gap-1.5">
        <Label :for="id('label')">Libellé</Label>
        <Input :id="id('label')" v-model="field.label" maxlength="100" />
      </div>
      <div class="grid gap-1.5">
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
              : 'Nom du champ dans l’API. Figé après l’enregistrement.'
          }}
        </p>
      </div>
    </div>

    <div class="flex flex-wrap gap-x-6 gap-y-2">
      <label class="flex items-center gap-2 text-sm">
        <input v-model="field.required" type="checkbox" class="size-4 accent-primary" />
        Obligatoire
      </label>
      <label
        v-if="TRANSLATABLE_FIELD_TYPES.includes(field.type)"
        class="flex items-center gap-2 text-sm"
      >
        <input
          v-model="field.translatable"
          type="checkbox"
          class="size-4 accent-primary"
          :disabled="frozen"
          :aria-describedby="frozen ? id('translatable-hint') : undefined"
        />
        Une valeur en français et une en anglais
        <span v-if="frozen" :id="id('translatable-hint')" class="sr-only">(figé)</span>
      </label>
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

    <fieldset v-else-if="field.type === 'choice'" class="grid gap-2">
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
          <Input :id="id(`choice-${c}-key`)" v-model="choice.key" class="font-mono" />
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

    <label v-else-if="field.type === 'number'" class="flex items-center gap-2 text-sm">
      <input v-model="field.decimals" type="checkbox" class="size-4 accent-primary" />
      Décimales autorisées
    </label>

    <label v-else-if="field.type === 'boolean'" class="flex items-center gap-2 text-sm">
      <input v-model="field.defaultValue" type="checkbox" class="size-4 accent-primary" />
      « Oui » par défaut
    </label>

    <div v-else-if="field.type === 'group'" class="grid gap-4">
      <div class="flex flex-wrap gap-4">
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
      </div>
      <fieldset class="grid gap-2 rounded-lg bg-muted/40 p-3">
        <legend class="sr-only">Sous-champs de « {{ field.label || 'Sans libellé' }} »</legend>
        <p class="text-sm font-medium" aria-hidden="true">Sous-champs</p>
        <FieldList
          v-model="field.fields"
          :id-prefix="id('sub')"
          :saved="saved?.type === 'group' ? saved.fields : []"
          :allow-group="false"
        />
      </fieldset>
    </div>
  </div>
</template>
