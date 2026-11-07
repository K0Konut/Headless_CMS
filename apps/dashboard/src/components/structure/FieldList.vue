<script setup lang="ts">
import { FIELD_TYPES, type Field, type FieldType } from '@dashility/shared'
import { ChevronDown, Trash2 } from '@lucide/vue'
import { nextTick, ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import MoveButtons from '@/components/MoveButtons.vue'
import { FIELD_TYPE_LABELS, moveItem, newField, stableIds } from '@/lib/content'
import { plural } from '@/lib/format'
import FieldForm from './FieldForm.vue'

const props = defineProps<{
  /** Préfixe des id HTML : une liste de sous-champs vit dans la page à côté de celle du type. */
  idPrefix: string
  /** Champs tels qu'enregistrés : leur identifiant, leur type et leur traduction sont figés. */
  saved: Field[]
  /** Un groupe ne contient pas d'autre groupe (document UX). */
  allowGroup: boolean
}>()
const fields = defineModel<Field[]>({ required: true })

const types = FIELD_TYPES.filter((t) => props.allowGroup || t !== 'group')
const newType = ref<FieldType>('text')
// Identifiant stable par champ (clé de rendu, champs ouverts) : l'ordre peut changer.
const idOf = stableIds()
const open = ref(new Set<number>())
const isOpen = (field: Field) => open.value.has(idOf(field))

// Champs ajoutés depuis l'ouverture : jamais figés, même si leur identifiant reprend celui
// d'un champ enregistré (c'est alors un doublon, signalé à l'enregistrement).
const added = new Set<number>()

function toggle(field: Field) {
  const id = idOf(field)
  if (!open.value.delete(id)) open.value.add(id)
}

async function add() {
  const field = newField(newType.value)
  fields.value.push(field)
  // Lu dans la liste : c'est le proxy réactif, celui que verront idOf et le rendu.
  added.add(idOf(fields.value.at(-1)!))
  toggle(fields.value.at(-1)!)
  await nextTick()
  document.getElementById(`${props.idPrefix}-${fields.value.length - 1}-label`)?.focus()
}

const title = (field: Field) => field.label || 'Sans libellé'

const savedField = (field: Field) =>
  added.has(idOf(field)) ? undefined : props.saved.find((f) => f.key === field.key)
</script>

<template>
  <div class="grid gap-3">
    <p v-if="!fields.length" class="text-sm text-muted-foreground">
      {{ allowGroup ? 'Aucun champ pour l’instant.' : 'Aucun sous-champ pour l’instant.' }}
    </p>
    <ol v-else class="grid gap-2">
      <li
        v-for="(field, i) in fields"
        :key="idOf(field)"
        class="rounded-lg border bg-card"
        :aria-labelledby="`${idPrefix}-${i}-title`"
      >
        <div class="flex flex-wrap items-center gap-2 p-3">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-expanded="isOpen(field)"
            :aria-controls="`${idPrefix}-${i}-form`"
            @click="toggle(field)"
          >
            <ChevronDown
              aria-hidden="true"
              class="size-4 shrink-0 transition-transform motion-reduce:transition-none"
              :class="{ '-rotate-90': !isOpen(field) }"
            />
            <span :id="`${idPrefix}-${i}-title`" class="truncate font-medium">
              {{ title(field) }}
            </span>
          </button>
          <!-- Sur téléphone, les badges passent sous le nom pour lui laisser la largeur. -->
          <div class="order-last flex w-full flex-wrap gap-1 pl-6 sm:order-none sm:w-auto sm:pl-0">
            <Badge variant="secondary">{{ FIELD_TYPE_LABELS[field.type] }}</Badge>
            <Badge v-if="field.required" variant="outline">Obligatoire</Badge>
            <Badge v-if="field.translatable" variant="outline">FR et EN</Badge>
            <Badge v-if="field.type === 'group'" variant="outline">
              {{ plural(field.fields.length, 'sous-champ') }}
            </Badge>
          </div>
          <div class="flex">
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
          </div>
        </div>
        <FieldForm
          v-if="isOpen(field)"
          :id="`${idPrefix}-${i}-form`"
          v-model="fields[i]!"
          :id-prefix="`${idPrefix}-${i}`"
          :saved="savedField(field)"
          class="border-t p-3"
        />
      </li>
    </ol>

    <div class="flex flex-wrap items-end gap-2">
      <div class="grid gap-1.5">
        <Label :for="`${idPrefix}-new-type`">
          {{ allowGroup ? 'Type du nouveau champ' : 'Type du nouveau sous-champ' }}
        </Label>
        <Select v-model="newType">
          <SelectTrigger :id="`${idPrefix}-new-type`" class="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="t in types" :key="t" :value="t">{{
              FIELD_TYPE_LABELS[t]
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="button" variant="outline" @click="add">
        {{ allowGroup ? 'Ajouter un champ' : 'Ajouter un sous-champ' }}
      </Button>
    </div>
  </div>
</template>
