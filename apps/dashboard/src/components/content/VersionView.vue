<script setup lang="ts">
import type { EntryData, Field } from '@dashility/shared'
import { provide, ref } from 'vue'
import { FROZEN, READONLY_KEY } from '@/lib/content'
import FieldRows from './FieldRows.vue'

/** Une version de l'historique (V4), en lecture seule, à la place de la saisie : elle ne touche ni
 *  au brouillon ni à ses erreurs de publication. */
defineProps<{ fields: Field[]; data: EntryData; number: number; lang: 'both' | 'fr' | 'en' }>()
provide(READONLY_KEY, ref(true))
</script>

<template>
  <fieldset disabled :class="['min-w-0', FROZEN]">
    <legend class="sr-only">Champs (lecture seule : version {{ number }})</legend>
    <FieldRows :model-value="data" :fields="fields" id-prefix="entry" :lang="lang" :errors="{}" />
  </fieldset>
</template>
