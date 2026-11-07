<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EntryEditor from '@/components/content/EntryEditor.vue'
import StatusBadges from '@/components/content/StatusBadges.vue'
import FormError from '@/components/FormError.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, errorMessage } from '@/lib/api'
import type { ContentType, Entry, EntrySummary } from '@/lib/content'
import { formatDay } from '@/lib/format'

/** Un type : la liste de ses entrées pour une collection, l'éditeur pour une page unique. */
const route = useRoute()
const router = useRouter()
const space = computed(() => String(route.params.espace))
const typeSlug = computed(() => String(route.params.type))
const base = computed(
  () => `/spaces/${encodeURIComponent(space.value)}/types/${encodeURIComponent(typeSlug.value)}`,
)

const type = ref<ContentType | null>(null)
const entries = ref<EntrySummary[] | null>(null)
const error = ref('')

watch(
  base,
  async () => {
    type.value = null
    entries.value = null
    error.value = ''
    try {
      type.value = await api<ContentType>(base.value)
      if (type.value.kind === 'collection') {
        entries.value = await api<EntrySummary[]>(`${base.value}/entries`)
      }
    } catch (err) {
      error.value = errorMessage(err)
    }
  },
  { immediate: true },
)

const FILTERS = {
  all: 'Toutes',
  draft: 'Brouillons',
  published: 'Publiées',
  incomplete: 'EN incomplet',
}
const filter = ref<keyof typeof FILTERS>('all')
const shown = computed(() =>
  (entries.value ?? []).filter((e) =>
    filter.value === 'all'
      ? true
      : filter.value === 'draft'
        ? e.status === 'draft'
        : filter.value === 'published'
          ? e.status !== 'draft'
          : !e.enComplete,
  ),
)

const adding = ref(false)
async function add() {
  adding.value = true
  try {
    const created = await api<Entry>(`${base.value}/entries`, { method: 'POST' })
    await router.push(`/espaces/${space.value}/contenu/${typeSlug.value}/${created.id}`)
  } catch (err) {
    error.value = errorMessage(err)
    adding.value = false
  }
}
</script>

<template>
  <FormError v-if="error" :message="error" class="max-w-md" />
  <Skeleton v-else-if="!type" class="h-64" />

  <EntryEditor v-else-if="type.kind === 'single'" :space="space" :type="type" entry-id="single" />

  <template v-else>
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold tracking-tight">{{ type.name }}</h1>
      <Button :disabled="adding" @click="add">
        <Plus aria-hidden="true" />Ajouter {{ type.entryLabel }}
      </Button>
    </div>

    <Skeleton v-if="!entries" class="mt-8 h-48" />
    <p v-else-if="!entries.length" class="mt-8 text-muted-foreground">
      Aucune entrée pour l’instant.
    </p>
    <template v-else>
      <div class="mt-6 grid max-w-56 gap-1.5">
        <Label for="filtre">Afficher</Label>
        <Select v-model="filter">
          <SelectTrigger id="filtre"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="(label, key) in FILTERS" :key="key" :value="key">
              {{ label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p v-if="!shown.length" class="mt-6 text-muted-foreground">
        Aucune entrée ne correspond à ce filtre.
        <button type="button" class="underline" @click="filter = 'all'">Tout afficher</button>
      </p>
      <Table v-else class="mt-4">
        <TableHeader>
          <TableRow>
            <TableHead>Titre</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead class="hidden sm:table-cell">Modifié</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="entry in shown" :key="entry.id">
            <TableCell class="max-w-64 truncate font-medium">
              <RouterLink
                :to="`/espaces/${space}/contenu/${type.slug}/${entry.id}`"
                class="hover:underline"
              >
                {{ entry.title || 'Sans titre' }}
              </RouterLink>
            </TableCell>
            <TableCell>
              <StatusBadges :status="entry.status" :en-complete="entry.enComplete" />
            </TableCell>
            <TableCell class="hidden text-muted-foreground sm:table-cell">
              {{ formatDay(entry.updatedAt.slice(0, 10)) }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </template>
  </template>
</template>
