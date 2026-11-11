<script setup lang="ts">
import { ChevronLeft, File, Library, Plus } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import FormError from '@/components/FormError.vue'
import MoveButtons from '@/components/MoveButtons.vue'
import TypeEditor from '@/components/structure/TypeEditor.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { type ContentType, moveItem } from '@/lib/content'
import { formatDate, plural } from '@/lib/format'
import { useContentStore } from '@/stores/content'

const route = useRoute()
const router = useRouter()
// Types listés sous « Contenu » dans la barre latérale : relus quand la structure change sans
// changer d'URL (champs d'un type, ordre).
const content = useContentStore()

const space = computed(() => String(route.params.espace))
const selected = computed(() =>
  typeof route.params.type === 'string' ? route.params.type : undefined,
)
const base = computed(() => `/espaces/${space.value}/structure`)

const types = ref<ContentType[] | null>(null)
const error = ref('')
const orderError = ref('')

async function load() {
  error.value = ''
  types.value = null
  try {
    types.value = await api<ContentType[]>(`/spaces/${encodeURIComponent(space.value)}/types`)
  } catch (err) {
    error.value = errorMessage(err)
  }
}
watch(space, load, { immediate: true })

/** Colonne « Champs » de la vue d'ensemble : leur nombre et les premiers libellés. */
const fieldsSummary = (type: ContentType) => type.fields.map((f) => f.label).join(', ')

const current = computed(() => types.value?.find((t) => t.slug === selected.value))

function onSaved(saved: ContentType) {
  const list = types.value!
  const index = list.findIndex((t) => t.slug === saved.slug)
  if (index === -1) {
    list.push(saved)
    void router.replace(`${base.value}/${saved.slug}`)
  } else {
    list[index] = saved
    void content.load(space.value)
  }
}

function onDeleted(slug: string) {
  types.value = types.value!.filter((t) => t.slug !== slug)
  void router.replace(base.value)
}

// Un déplacement à la fois : l'ordre affiché reste celui enregistré, même en cas d'échec.
const ordering = ref(false)

async function move(index: number, delta: -1 | 1) {
  const list = types.value!
  const previous = [...list]
  moveItem(list, index, delta)
  orderError.value = ''
  ordering.value = true
  try {
    await api(`/spaces/${encodeURIComponent(space.value)}/type-order`, {
      method: 'PUT',
      body: { slugs: list.map((t) => t.slug) },
    })
    void content.load(space.value)
  } catch (err) {
    types.value = previous
    orderError.value = errorMessage(err)
  } finally {
    ordering.value = false
  }
}
</script>

<template>
  <template v-if="!selected">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="flex-1 text-2xl font-semibold tracking-tight">Structure</h1>
      <Button v-if="types?.length" as-child>
        <RouterLink :to="`${base}/nouveau`"><Plus aria-hidden="true" />Nouveau type</RouterLink>
      </Button>
    </div>
    <p class="mt-1 max-w-prose text-sm text-muted-foreground">
      Les types de contenu de l’espace et leurs champs. Les membres remplissent ces champs dans
      Contenu, sans pouvoir les modifier.
    </p>
  </template>

  <FormError v-if="error" :message="error" class="mt-6 max-w-md" />
  <Skeleton v-else-if="!types" class="mt-8 h-64" />

  <template v-else-if="selected">
    <TypeEditor
      v-if="selected === 'nouveau' || current"
      :space="space"
      :type="current ?? null"
      @saved="onSaved"
      @deleted="onDeleted"
    />
    <div v-else class="grid justify-items-start gap-4">
      <RouterLink
        :to="base"
        class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft class="size-4" aria-hidden="true" />Structure
      </RouterLink>
      <p>Ce type n’existe pas, ou a été supprimé.</p>
    </div>
  </template>

  <div
    v-else-if="!types.length"
    class="mt-8 grid max-w-md justify-items-start gap-4 rounded-lg border border-dashed p-6"
  >
    <p>
      Commencez par créer un type : une collection (projets, articles) ou une page unique (accueil,
      à propos).
    </p>
    <Button as-child>
      <RouterLink :to="`${base}/nouveau`">Nouveau type</RouterLink>
    </Button>
  </div>

  <div v-else class="mt-8 grid gap-3">
    <FormError :message="orderError" />
    <!-- Vue d'ensemble (document UX) : une ligne par type, dans l'ordre du site. -->
    <table class="w-full overflow-hidden rounded-lg border bg-card text-sm">
      <thead class="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
        <tr>
          <td class="w-10 py-2 pl-4" />
          <th scope="col" class="py-2 pr-4">Type</th>
          <th scope="col" class="hidden py-2 pr-4 md:table-cell">Nature</th>
          <th scope="col" class="hidden w-2/5 py-2 pr-4 sm:table-cell">Champs</th>
          <th scope="col" class="hidden py-2 pr-4 lg:table-cell">Entrées</th>
          <th scope="col" class="hidden py-2 pr-4 lg:table-cell">Modifié</th>
          <th scope="col" class="py-2 pr-2"><span class="sr-only">Ordre</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(type, i) in types"
          :key="type.slug"
          class="relative border-t hover:bg-accent/60"
        >
          <td class="py-2.5 pl-4 text-muted-foreground">
            <component
              :is="type.kind === 'collection' ? Library : File"
              class="size-4"
              aria-hidden="true"
            />
          </td>
          <td class="py-2.5 pr-4">
            <!-- Lien étiré sur toute la ligne ; les boutons d'ordre passent au-dessus. -->
            <RouterLink
              :to="`${base}/${type.slug}`"
              class="font-semibold outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            >
              {{ type.name }}
            </RouterLink>
          </td>
          <td class="hidden py-2.5 pr-4 md:table-cell">
            {{ type.kind === 'collection' ? 'Collection' : 'Page unique' }}
          </td>
          <td class="hidden max-w-0 truncate py-2.5 pr-4 text-muted-foreground sm:table-cell">
            <span class="font-medium text-foreground">{{
              plural(type.fields.length, 'champ')
            }}</span>
            <template v-if="type.fields.length"> : {{ fieldsSummary(type) }}</template>
          </td>
          <td class="hidden py-2.5 pr-4 tabular-nums lg:table-cell">
            {{ type.kind === 'collection' ? type.counts.total : '—' }}
          </td>
          <td class="hidden py-2.5 pr-4 text-muted-foreground tabular-nums lg:table-cell">
            {{ formatDate(type.updatedAt) }}
          </td>
          <td class="relative z-10 py-1 pr-2 text-right whitespace-nowrap">
            <MoveButtons
              :disabled="ordering"
              :name="type.name"
              :index="i"
              :length="types.length"
              @move="move(i, $event)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
