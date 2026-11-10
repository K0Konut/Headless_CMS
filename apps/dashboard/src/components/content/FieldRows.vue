<script setup lang="ts">
import type { EntryData, Field } from '@dashility/shared'
import FieldInput from './FieldInput.vue'
import GroupInput from './GroupInput.vue'

/** Les champs d'une entrée, une ligne par champ : français et anglais côte à côte pour un champ
 *  traduisible (document UX), ou seulement la langue choisie (`lang`), sur toute la largeur. */
const props = defineProps<{
  fields: Field[]
  idPrefix: string
  lang: 'both' | 'fr' | 'en'
  /** Erreurs de publication, par chemin (`title.fr`, `steps.0.name.fr`). */
  errors?: Record<string, string>
  /** Préfixe des chemins de ces champs (`steps.0.` dans un groupe). */
  path?: string
}>()
const data = defineModel<EntryData>({ required: true })

const LANGS = ['fr', 'en'] as const
const LANG_NAMES = { fr: 'français', en: 'anglais' }

const translated = (field: Field, lang: 'fr' | 'en') =>
  (data.value[field.key] as Record<string, unknown> | undefined)?.[lang]
function setTranslated(field: Field, lang: 'fr' | 'en', value: unknown) {
  data.value[field.key] = { ...(data.value[field.key] as object | undefined), [lang]: value }
}
/** Erreur d'une valeur, ou d'une de ses parties (début d'une date, texte alternatif d'une
 *  image…), quel que soit le suffixe ajouté par les règles de publication. */
function errorOf(field: Field, lang?: 'fr' | 'en') {
  const at = `${props.path ?? ''}${field.key}${lang ? `.${lang}` : ''}`
  const errors = props.errors ?? {}
  // Un groupe n'a que ses propres erreurs : celles de ses éléments s'affichent sur leurs champs.
  if (errors[at] || field.type === 'group') return errors[at]
  const part = Object.keys(errors).find((path) => path.startsWith(`${at}.`))
  return part && errors[part]
}

const id = (field: Field, lang?: string) =>
  [props.idPrefix, field.key, lang].filter(Boolean).join('-')
</script>

<template>
  <div class="grid">
    <div
      v-for="field in fields"
      :key="field.key"
      role="group"
      :aria-labelledby="id(field, 'label')"
      class="grid gap-2 border-b py-4 last:border-b-0 md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-4"
    >
      <div :id="id(field, 'label')" class="text-sm font-medium md:pt-2">
        {{ field.label }}
        <template v-if="field.required">
          <span aria-hidden="true" class="text-muted-foreground">*</span>
          <span class="sr-only">(obligatoire)</span>
        </template>
      </div>

      <GroupInput
        v-if="field.type === 'group'"
        v-model="data[field.key] as EntryData[] | undefined"
        :field="field"
        :id-prefix="id(field)"
        :lang="lang"
        :errors="errors"
        :path="`${path ?? ''}${field.key}.`"
        :error="errorOf(field)"
        class="md:col-span-2"
      />
      <template v-else-if="field.translatable">
        <FieldInput
          v-for="l in LANGS"
          :id="id(field, l)"
          :key="l"
          :field="field"
          :label="`${field.label} (${LANG_NAMES[l]})`"
          :lang="l"
          :error="errorOf(field, l)"
          :model-value="translated(field, l)"
          :class="lang === 'both' ? '' : lang === l ? 'md:col-span-2' : 'hidden'"
          @update:model-value="setTranslated(field, l, $event)"
        />
      </template>
      <FieldInput
        v-else
        :id="id(field)"
        v-model="data[field.key]"
        :field="field"
        :label="field.label"
        :error="errorOf(field)"
        class="md:col-span-2"
      />
    </div>
  </div>
</template>
