<script setup lang="ts">
import { File, Library, Plus, Trash2 } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import FormError from '@/components/FormError.vue'
import StatusPill from '@/components/StatusPill.vue'
import StatusBadges from '@/components/content/StatusBadges.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import type { ContentType, Entry, TodoEntry } from '@/lib/content'
import { formatDate, plural } from '@/lib/format'
import { useContentStore } from '@/stores/content'
import { useSessionStore } from '@/stores/session'

/** Contenu (document UX) : ce qui reste à faire, puis les collections et les pages. Les types
 *  viennent du store, relu à chaque navigation par la mise en page. */
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const content = useContentStore()
const space = computed(() => String(route.params.espace))

/** Nombre d'entrées de la corbeille, pour son lien (absent si elle est vide). */
const trashCount = ref(0)
const todo = ref<TodoEntry[] | null>(null)
const showAllTodo = ref(false)
const todoError = ref('')
let latest = 0
watch(
  space,
  async () => {
    const request = ++latest
    todo.value = null
    todoError.value = ''
    showAllTodo.value = false
    trashCount.value = 0
    // La corbeille n'empêche pas l'écran : sans réponse, son lien n'apparaît pas.
    api<unknown[]>(`/spaces/${encodeURIComponent(space.value)}/trash`)
      .then((trash) => request === latest && (trashCount.value = trash.length))
      .catch(() => {})
    try {
      const loaded = await api<TodoEntry[]>(`/spaces/${encodeURIComponent(space.value)}/todo`)
      if (request === latest) todo.value = loaded
    } catch (err) {
      if (request === latest) todoError.value = errorMessage(err)
    }
  },
  { immediate: true },
)

/** Au-delà, « Tout afficher » déplie le reste (document UX). */
const TODO_SHOWN = 8
const shownTodo = computed(() =>
  showAllTodo.value ? todo.value : todo.value?.slice(0, TODO_SHOWN),
)

// Le store peut encore tenir l'espace précédent pendant le chargement.
const types = computed(() => (content.space === space.value ? content.types : null))
// Un type sans champ n'apparaît pas tant qu'il n'a aucun champ (document UX, « Structure »).
const ready = computed(() => types.value?.filter((t) => t.fields.length) ?? [])
const collections = computed(() => ready.value.filter((t) => t.kind === 'collection'))
const pages = computed(() => ready.value.filter((t) => t.kind === 'single'))

/** Liseré d'une ligne « À traiter » : la couleur du statut le plus pressant
 *  (direction visuelle, « Statuts »). */
function rail(entry: TodoEntry) {
  if (entry.status === 'modified') return 'bg-status-modified'
  if (entry.status === 'draft') return 'bg-status-draft'
  if (!entry.enComplete) return 'bg-status-en'
  return 'bg-status-scheduled'
}
const entryPath = (entry: TodoEntry) =>
  `/espaces/${space.value}/contenu/${entry.type.slug}` +
  (entry.type.kind === 'collection' ? `/${entry.id}` : '')

const adding = ref('')
const addError = ref('')
async function add(type: ContentType) {
  adding.value = type.slug
  addError.value = ''
  try {
    const base = `/spaces/${encodeURIComponent(space.value)}/types/${encodeURIComponent(type.slug)}/entries`
    const created = await api<Entry>(base, { method: 'POST' })
    await router.push(`/espaces/${space.value}/contenu/${type.slug}/${created.id}`)
  } catch (err) {
    addError.value = errorMessage(err)
  } finally {
    adding.value = ''
  }
}

const ROW =
  'relative grid items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 first:border-t-0 hover:bg-accent/60'
// Lien étiré sur toute la ligne ; les boutons de la ligne passent au-dessus.
const STRETCHED =
  'outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset'
</script>

<template>
  <h1 class="text-2xl font-semibold tracking-tight">Contenu</h1>

  <FormError v-if="content.error && !types" :message="content.error" class="mt-6 max-w-md" />
  <div v-else-if="!types" class="mt-8 grid gap-2">
    <Skeleton v-for="i in 5" :key="i" class="h-11" />
  </div>

  <div
    v-else-if="!ready.length"
    class="mt-8 grid max-w-md justify-items-start gap-4 rounded-lg border border-dashed p-6"
  >
    <template v-if="session.me?.user.isSuperAdmin">
      <p>Cet espace n’a pas encore de type de contenu.</p>
      <Button as-child>
        <RouterLink :to="`/espaces/${space}/structure/nouveau`">Créer un type</RouterLink>
      </Button>
    </template>
    <p v-else>
      Le contenu de cet espace n’est pas encore prêt. Votre administrateur doit d’abord le
      configurer.
    </p>
  </div>

  <div v-else class="mt-8 grid gap-8">
    <section aria-labelledby="todo-title">
      <h2 id="todo-title" class="mb-2.5 flex items-center gap-2 font-semibold">
        À traiter
        <span
          v-if="todo?.length"
          class="rounded-full bg-foreground px-2 text-xs leading-5 text-background"
        >
          {{ todo.length
          }}<span class="sr-only">{{ todo.length > 1 ? ' entrées' : ' entrée' }}</span>
        </span>
      </h2>
      <FormError v-if="todoError" :message="todoError" />
      <Skeleton v-else-if="!todo" class="h-11" />
      <p v-else-if="!todo.length" class="text-sm text-muted-foreground">
        Tout est publié et traduit.
      </p>
      <div v-else class="overflow-hidden rounded-lg border bg-card">
        <ul>
          <li
            v-for="entry in shownTodo"
            :key="entry.id"
            :class="[ROW, 'pl-5 sm:grid-cols-[minmax(0,1fr)_auto_6rem]']"
          >
            <span :class="['absolute inset-y-0 left-0 w-1', rail(entry)]" aria-hidden="true" />
            <RouterLink :to="entryPath(entry)" :class="['truncate', STRETCHED]">
              <template v-if="entry.type.kind === 'collection'">
                <span class="text-muted-foreground">{{ entry.type.name }} › </span>
              </template>
              <span class="font-semibold">{{ entry.title || 'Sans titre' }}</span>
            </RouterLink>
            <StatusBadges
              todo
              :status="entry.status"
              :en-complete="entry.enComplete"
              :scheduled-at="entry.scheduledAt"
            />
            <span class="text-sm text-muted-foreground tabular-nums sm:text-right">
              {{ formatDate(entry.updatedAt) }}
            </span>
          </li>
        </ul>
        <button
          v-if="todo.length > TODO_SHOWN"
          type="button"
          class="w-full border-t px-5 py-2 text-left text-sm font-medium text-primary hover:bg-accent/60"
          :aria-expanded="showAllTodo"
          @click="showAllTodo = !showAllTodo"
        >
          {{ showAllTodo ? 'Afficher moins' : `Tout afficher (${todo.length})` }}
        </button>
      </div>
    </section>

    <section v-if="collections.length" aria-labelledby="collections-title">
      <h2 id="collections-title" class="mb-2.5 font-semibold">Collections</h2>
      <FormError v-if="addError" :message="addError" class="mb-2" />
      <ul class="overflow-hidden rounded-lg border bg-card">
        <li
          v-for="type in collections"
          :key="type.slug"
          :class="[
            ROW,
            'grid-cols-[1.25rem_minmax(0,1fr)_auto] sm:grid-cols-[1.25rem_minmax(0,1fr)_auto_6rem_auto]',
          ]"
        >
          <Library class="size-4 text-muted-foreground" aria-hidden="true" />
          <RouterLink
            :to="`/espaces/${space}/contenu/${type.slug}`"
            :class="['truncate font-semibold', STRETCHED]"
          >
            {{ type.name }}
          </RouterLink>
          <span
            class="col-start-2 row-start-2 flex flex-wrap gap-1 sm:col-start-auto sm:row-start-auto"
          >
            <template v-if="type.counts.total">
              <StatusPill v-if="type.counts.published" tone="published">
                {{ plural(type.counts.published, 'publié') }}
              </StatusPill>
              <StatusPill v-if="type.counts.total - type.counts.published" tone="draft">
                {{ plural(type.counts.total - type.counts.published, 'brouillon') }}
              </StatusPill>
              <StatusPill v-if="type.counts.modified" tone="modified">
                {{ plural(type.counts.modified, 'modifié') }}
              </StatusPill>
              <StatusPill v-if="type.counts.scheduled" tone="scheduled">
                {{ plural(type.counts.scheduled, 'programmé') }}
              </StatusPill>
              <StatusPill v-if="type.counts.enIncomplete" tone="en">
                {{ plural(type.counts.enIncomplete, 'EN incomplet') }}
              </StatusPill>
            </template>
            <span v-else class="text-sm text-muted-foreground">0 entrée</span>
          </span>
          <span class="hidden text-sm text-muted-foreground tabular-nums sm:block sm:text-right">
            {{ type.lastEntryUpdatedAt ? formatDate(type.lastEntryUpdatedAt) : '' }}
          </span>
          <Button
            variant="outline"
            size="sm"
            class="relative z-10 col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto"
            :disabled="adding === type.slug"
            :aria-label="`Ajouter ${type.entryLabel ?? 'une entrée'}`"
            @click="add(type)"
          >
            <Plus aria-hidden="true" />Ajouter
          </Button>
        </li>
      </ul>
    </section>

    <section v-if="pages.length" aria-labelledby="pages-title">
      <h2 id="pages-title" class="mb-2.5 font-semibold">Pages</h2>
      <ul class="overflow-hidden rounded-lg border bg-card">
        <li
          v-for="type in pages"
          :key="type.slug"
          :class="[
            ROW,
            'grid-cols-[1.25rem_minmax(0,1fr)] sm:grid-cols-[1.25rem_minmax(0,1fr)_auto_6rem]',
          ]"
        >
          <File class="size-4 text-muted-foreground" aria-hidden="true" />
          <RouterLink
            :to="`/espaces/${space}/contenu/${type.slug}`"
            :class="['truncate font-semibold', STRETCHED]"
          >
            {{ type.name }}
          </RouterLink>
          <span class="col-start-2 flex flex-wrap gap-1 sm:col-start-auto">
            <StatusPill v-if="type.counts.published" tone="published">Publiée</StatusPill>
            <StatusPill v-else tone="draft">Brouillon</StatusPill>
            <StatusPill v-if="type.counts.modified" tone="modified">
              Modifications non publiées
            </StatusPill>
            <StatusPill v-if="type.counts.scheduled" tone="scheduled">Programmée</StatusPill>
            <StatusPill v-if="type.counts.enIncomplete" tone="en">EN incomplet</StatusPill>
          </span>
          <span class="hidden text-sm text-muted-foreground tabular-nums sm:block sm:text-right">
            {{ type.lastEntryUpdatedAt ? formatDate(type.lastEntryUpdatedAt) : '' }}
          </span>
        </li>
      </ul>
    </section>

    <RouterLink
      v-if="trashCount"
      :to="`/espaces/${space}/contenu/corbeille`"
      class="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <Trash2 class="size-4" aria-hidden="true" />Corbeille ({{ trashCount }})
    </RouterLink>
  </div>
</template>
