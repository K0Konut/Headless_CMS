<script setup lang="ts">
import type { EntryData, Field } from '@dashility/shared'
import { computed, provide, ref, watch } from 'vue'
import FieldRows from '@/components/content/FieldRows.vue'
import { READONLY_KEY } from '@/lib/content'

/** Aperçu de l'éditeur d'entrée avec la structure en cours, même non enregistrée (document UX,
 *  « Aperçu »). Désactivé : un envoi d'image ou de PDF y créerait un vrai fichier. */
const props = defineProps<{ fields: Field[] }>()
// Un champ sans identifiant (libellé encore vide) n'a pas de place dans une entrée.
const shown = computed(() => props.fields.filter((f) => f.key))

// Un élément vide par groupe, pour en montrer les sous-champs.
const sample = () =>
  Object.fromEntries(shown.value.filter((f) => f.type === 'group').map((f) => [f.key, [{}]]))
const data = ref<EntryData>(sample())
watch(
  () => shown.value.map((f) => f.key).join(),
  () => (data.value = sample()),
)
provide(READONLY_KEY, ref(true))
</script>

<template>
  <div class="grid gap-3">
    <p class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
      Aperçu de l’éditeur que verront les membres, avec la structure en cours. Les champs sont
      désactivés.
    </p>
    <p v-if="!shown.length" class="text-sm text-muted-foreground">
      Ce type n’a encore aucun champ.
    </p>
    <template v-else>
      <div
        class="hidden border-b pb-2 text-sm text-muted-foreground md:grid md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-4"
        aria-hidden="true"
      >
        <span />
        <span>Français</span>
        <span lang="en">English</span>
      </div>
      <fieldset disabled class="min-w-0">
        <legend class="sr-only">Aperçu des champs</legend>
        <FieldRows v-model="data" :fields="shown" id-prefix="preview" lang="both" />
      </fieldset>
    </template>
  </div>
</template>
