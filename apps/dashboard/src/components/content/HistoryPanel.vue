<script setup lang="ts">
import { ref, watch } from 'vue'
import FormError from '@/components/FormError.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import type { EntryVersion } from '@/lib/content'
import { formatShortDateTime } from '@/lib/format'

/** Historique d'une entrée (document UX, « Historique, dans l'éditeur ») : une ligne par
 *  publication, relu à chaque ouverture. Choisir une version l'ouvre dans l'éditeur. */
const props = defineProps<{ base: string; title: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ view: [number] }>()

const versions = ref<EntryVersion[] | null>(null)
const error = ref('')

async function load() {
  versions.value = null
  error.value = ''
  try {
    versions.value = await api<EntryVersion[]>(`${props.base}/versions`)
  } catch (err) {
    error.value = errorMessage(err)
  }
}
watch(open, (isOpen) => isOpen && load())

function author(version: EntryVersion) {
  if (version.scheduled) return 'publication programmée'
  return version.publishedBy
}
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="gap-0 motion-reduce:animate-none">
      <SheetHeader class="border-b">
        <SheetTitle>Historique</SheetTitle>
        <SheetDescription>{{ title }} · une version par publication</SheetDescription>
      </SheetHeader>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div v-if="error" class="grid justify-items-start gap-3 p-4">
          <FormError :message="`L’historique n’a pas pu être chargé : ${error}`" />
          <Button variant="outline" size="sm" @click="load">Réessayer</Button>
        </div>
        <div v-else-if="!versions" class="grid gap-3 p-4">
          <Skeleton v-for="i in 3" :key="i" class="h-12" />
        </div>
        <ol v-else>
          <li v-for="version in versions" :key="version.number" class="border-b">
            <button
              type="button"
              class="grid w-full gap-0.5 px-4 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              @click="emit('view', version.number)"
            >
              <span class="flex items-center gap-2 font-medium">
                Version {{ version.number }}
                <Badge v-if="version.online" variant="secondary">en ligne</Badge>
              </span>
              <span class="text-sm text-muted-foreground">
                {{ formatShortDateTime(version.publishedAt)
                }}<template v-if="author(version)"> · {{ author(version) }}</template>
              </span>
            </button>
          </li>
        </ol>
      </div>
    </SheetContent>
  </Sheet>
</template>
