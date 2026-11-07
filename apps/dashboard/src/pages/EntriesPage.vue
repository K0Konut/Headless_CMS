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
import { formatDate } from '@/lib/format'

/** Un type : la liste de ses entrées pour une collection, l'éditeur pour une page unique ou
 *  pour l'entrée de l'URL (`/contenu/:type/:entree`). */
const route = useRoute()
const router = useRouter()
const space = computed(() => String(route.params.espace))
const typeSlug = computed(() => String(route.params.type))
const entryParam = computed(() =>
  typeof route.params.entree === 'string' ? route.params.entree : undefined,
)
const base = computed(
  () => `/spaces/${encodeURIComponent(space.value)}/types/${encodeURIComponent(typeSlug.value)}`,
)

const type = ref<ContentType | null>(null)
const entries = ref<EntrySummary[] | null>(null)
const error = ref('')

// Le type, et en parallèle la liste quand l'URL ne désigne pas une entrée (une page unique
// renvoie une liste d'une entrée, ignorée). Seule la réponse de la dernière navigation compte.
let latest = 0
watch(
  [base, entryParam],
  async ([url, entry], previous) => {
    const request = ++latest
    const sameType = previous?.[0] === url && type.value
    if (!sameType) type.value = null
    entries.value = null
    error.value = ''
    try {
      const [loaded, list] = await Promise.all([
        sameType ? type.value! : api<ContentType>(url),
        entry ? null : api<EntrySummary[]>(`${url}/entries`),
      ])
      if (request !== latest) return
      type.value = loaded
      entries.value = list
    } catch (err) {
      if (request === latest) error.value = errorMessage(err)
    }
  },
  { immediate: true },
)
const editing = computed(
  () => entryParam.value ?? (type.value?.kind === 'single' ? 'single' : undefined),
)

const FILTERS: Record<string, { label: string; keep: (e: EntrySummary) => boolean }> = {
  all: { label: 'Toutes', keep: () => true },
  draft: { label: 'Brouillons', keep: (e) => e.status === 'draft' },
  published: { label: 'Publiées', keep: (e) => e.status !== 'draft' },
  incomplete: { label: 'EN incomplet', keep: (e) => !e.enComplete },
}
const filter = ref('all')
const shown = computed(() => (entries.value ?? []).filter(FILTERS[filter.value]!.keep))

const adding = ref(false)
async function add() {
  adding.value = true
  try {
    const created = await api<Entry>(`${base.value}/entries`, { method: 'POST' })
    await router.push(`/espaces/${space.value}/contenu/${typeSlug.value}/${created.id}`)
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    // La page reste montée pour l'entrée créée : le bouton doit resservir au retour à la liste.
    adding.value = false
  }
}
</script>

<template>
  <FormError v-if="error" :message="error" class="max-w-md" />
  <Skeleton v-else-if="!type" class="h-64" />

  <EntryEditor v-else-if="editing" :key="editing" :space="space" :type="type" :entry-id="editing" />

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
            <SelectItem v-for="(f, key) in FILTERS" :key="key" :value="key">
              {{ f.label }}
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
              {{ formatDate(entry.updatedAt) }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </template>
  </template>
</template>
