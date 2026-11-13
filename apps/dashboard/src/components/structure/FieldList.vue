<script setup lang="ts">
import type { Field, FieldType } from '@dashility/shared'
import { ChevronRight, Plus, Trash2 } from '@lucide/vue'
import { nextTick, ref } from 'vue'
import { Button } from '@/components/ui/button'
import MoveButtons from '@/components/MoveButtons.vue'
import { FIELD_TYPE_ICONS, FIELD_TYPE_LABELS, moveItem, newField, stableIds } from '@/lib/content'
import { plural } from '@/lib/format'
import FieldForm from './FieldForm.vue'
import FieldTypePicker from './FieldTypePicker.vue'

/** Champs d'un type (ou sous-champs d'un groupe) : une ligne par champ, dépliée sur place pour
 *  le modifier, un seul à la fois (document UX, « Éditeur d'un type »). */
const props = defineProps<{
  /** Préfixe des id HTML : une liste de sous-champs vit dans la page à côté de celle du type. */
  idPrefix: string
  /** Champs tels qu'enregistrés : leur identifiant, leur type et leur traduction sont figés. */
  saved: Field[]
  /** Un groupe ne contient pas d'autre groupe (document UX). */
  topLevel: boolean
}>()
const fields = defineModel<Field[]>({ required: true })

// Identifiant stable par champ (clé de rendu, champ ouvert) : l'ordre peut changer.
const idOf = stableIds()
const openId = ref<number | null>(null)
const isOpen = (field: Field) => openId.value === idOf(field)

// Champs ajoutés depuis l'ouverture : jamais figés, même si leur identifiant reprend celui
// d'un champ enregistré (c'est alors un doublon, signalé à l'enregistrement).
const added = new Set<number>()

function toggle(field: Field) {
  openId.value = isOpen(field) ? null : idOf(field)
}

const picking = ref(false)
async function add(type: FieldType) {
  picking.value = false
  fields.value.push(newField(type))
  // Lu dans la liste : c'est le proxy réactif, celui que verront idOf et le rendu.
  const field = fields.value.at(-1)!
  added.add(idOf(field))
  openId.value = idOf(field)
  await nextTick()
  document.getElementById(`${props.idPrefix}-${fields.value.length - 1}-label`)?.focus()
}
async function cancelPick() {
  picking.value = false
  await nextTick()
  document.getElementById(`${props.idPrefix}-add`)?.focus()
}

const title = (field: Field) => field.label || 'Sans libellé'
const typeName = (field: Field) =>
  field.type === 'group'
    ? `Groupe, ${plural(field.fields.length, 'sous-champ')}`
    : FIELD_TYPE_LABELS[field.type]

const savedField = (field: Field) =>
  added.has(idOf(field)) ? undefined : props.saved.find((f) => f.key === field.key)
</script>

<template>
  <div class="grid gap-3">
    <p v-if="!fields.length" class="text-sm text-muted-foreground">
      {{ topLevel ? 'Aucun champ pour l’instant.' : 'Aucun sous-champ pour l’instant.' }}
    </p>
    <ol v-else class="overflow-hidden rounded-lg border bg-card">
      <li
        v-for="(field, i) in fields"
        :key="idOf(field)"
        class="border-t first:border-t-0"
        :aria-labelledby="`${idPrefix}-${i}-title`"
      >
        <div
          :class="[
            'flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-2 pl-3',
            isOpen(field) && 'bg-accent/60',
          ]"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-expanded="isOpen(field)"
            :aria-controls="isOpen(field) ? `${idPrefix}-${i}-form` : undefined"
            @click="toggle(field)"
          >
            <ChevronRight
              aria-hidden="true"
              class="size-4 shrink-0 text-muted-foreground motion-safe:transition-transform"
              :class="{ 'rotate-90': isOpen(field) }"
            />
            <span
              class="grid size-7.5 shrink-0 place-items-center rounded-md bg-muted text-foreground/80"
              aria-hidden="true"
            >
              <component :is="FIELD_TYPE_ICONS[field.type]" class="size-4" />
            </span>
            <span :id="`${idPrefix}-${i}-title`" class="truncate font-medium">
              {{ title(field) }}
            </span>
          </button>
          <!-- Sur téléphone, le type et les réglages passent sous le nom pour lui laisser la largeur. -->
          <span
            class="order-last flex w-full flex-wrap gap-x-3 pl-17 text-sm text-muted-foreground sm:order-none sm:w-auto sm:pl-0"
          >
            <span>{{ typeName(field) }}</span>
            <span v-if="field.required" class="font-medium text-foreground/80">Obligatoire</span>
            <span v-if="field.translatable" class="font-medium text-foreground/80">Traduit</span>
          </span>
          <span class="flex">
            <MoveButtons
              :name="title(field)"
              :index="i"
              :length="fields.length"
              @move="moveItem(fields, i, $event)"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              :aria-label="`Supprimer « ${title(field)} »`"
              @click="fields.splice(i, 1)"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </span>
        </div>
        <FieldForm
          v-if="isOpen(field)"
          :id="`${idPrefix}-${i}-form`"
          v-model="fields[i]!"
          :id-prefix="`${idPrefix}-${i}`"
          :saved="savedField(field)"
          class="border-t bg-muted/30 py-4 pr-4 pl-4 sm:pl-17"
        />
      </li>
    </ol>

    <FieldTypePicker
      v-if="picking"
      :id-prefix="idPrefix"
      :top-level="topLevel"
      @pick="add"
      @cancel="cancelPick"
    />
    <Button
      v-else
      :id="`${idPrefix}-add`"
      type="button"
      variant="outline"
      class="justify-self-start"
      @click="picking = true"
    >
      <Plus aria-hidden="true" />{{ topLevel ? 'Ajouter un champ' : 'Ajouter un sous-champ' }}
    </Button>
  </div>
</template>
