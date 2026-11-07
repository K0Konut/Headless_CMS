<script setup lang="ts">
import { type EntryData, entryTitle, isEnComplete } from '@dashility/shared'
import { ArrowLeft } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave } from 'vue-router'
import FormError from '@/components/FormError.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, api, errorMessage } from '@/lib/api'
import { type ContentType, type Entry, statusOf } from '@/lib/content'
import { formatTime } from '@/lib/format'
import { slugify } from '@/lib/slug'
import FieldRows from './FieldRows.vue'
import StatusBadges from './StatusBadges.vue'

const props = defineProps<{ space: string; type: ContentType; entryId: string }>()

const base = computed(
  () =>
    `/spaces/${encodeURIComponent(props.space)}/types/${encodeURIComponent(props.type.slug)}/entries/${encodeURIComponent(props.entryId)}`,
)
const isCollection = computed(() => props.type.kind === 'collection')

const entry = ref<Entry | null>(null)
const loadError = ref('')
const data = ref<EntryData>({})
const slug = ref('')
/** Version de l'entrée côté serveur, renvoyée à chaque sauvegarde. */
let version = 0

type SaveState = 'saved' | 'saving' | 'error' | 'conflict'
const state = ref<SaveState>('saved')
const saveError = ref('')
/** Des modifications attendent d'être envoyées. */
const pending = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let loading = false

async function load() {
  loading = true
  loadError.value = ''
  clearTimeout(timer)
  try {
    const loaded = await api<Entry>(base.value)
    entry.value = loaded
    version = loaded.version
    // On reprend là où on s'était arrêté : les modifications en attente, sinon la version publiée.
    data.value = JSON.parse(JSON.stringify(loaded.draft ?? loaded.published ?? {}))
    slug.value = loaded.slug ?? ''
    state.value = 'saved'
    pending.value = false
  } catch (err) {
    loadError.value = errorMessage(err)
  }
  await nextTick()
  loading = false
}
watch(base, load, { immediate: true })

const title = computed(() => entryTitle(props.type.fields, data.value))

// L'identifiant d'URL suit le titre tant que l'entrée n'a jamais été publiée et qu'il est celui
// généré à partir du titre (document UX, « Identifiant d'URL »).
watch(title, (next, previous) => {
  if (loading || !isCollection.value || entry.value?.publishedAt) return
  if (slug.value === slugify(previous)) slug.value = slugify(next)
})

// Sauvegarde automatique, une seconde après la dernière modification.
watch(
  [data, slug],
  () => {
    if (loading) return
    pending.value = true
    if (state.value === 'conflict') return
    clearTimeout(timer)
    timer = setTimeout(save, 1000)
  },
  { deep: true },
)

async function save() {
  clearTimeout(timer)
  if (!pending.value || state.value === 'saving' || state.value === 'conflict') return
  pending.value = false
  state.value = 'saving'
  try {
    const saved = await api<Entry>(base.value, {
      method: 'PATCH',
      body: {
        version,
        data: data.value,
        ...(isCollection.value && { slug: slug.value || null }),
      },
    })
    version = saved.version
    entry.value = saved
    state.value = 'saved'
    saveError.value = ''
  } catch (err) {
    pending.value = true
    if (err instanceof ApiError && err.status === 409) {
      state.value = 'conflict'
      return
    }
    state.value = 'error'
    saveError.value = errorMessage(err)
    return
  }
  // Des modifications sont arrivées pendant l'envoi.
  if (pending.value) timer = setTimeout(save, 1000)
}

const status = computed(() => (entry.value ? statusOf(entry.value) : 'draft'))
const enComplete = computed(() => isEnComplete(props.type.fields, data.value))
const savedAt = computed(() => (entry.value ? formatTime(entry.value.updatedAt) : ''))

/** Langue affichée sous 768 px, où les deux colonnes ne tiennent pas. */
const lang = ref<'fr' | 'en'>('fr')

// On ne quitte pas l'éditeur avec une saisie non enregistrée.
onBeforeRouteLeave(async () => {
  if (pending.value && state.value !== 'conflict') await save()
  return (
    !pending.value ||
    window.confirm('Vos dernières modifications ne sont pas enregistrées. Quitter quand même ?')
  )
})
const onUnload = (event: BeforeUnloadEvent) => {
  if (pending.value || state.value === 'saving') event.preventDefault()
}
window.addEventListener('beforeunload', onUnload)
onBeforeUnmount(() => {
  clearTimeout(timer)
  window.removeEventListener('beforeunload', onUnload)
})
</script>

<template>
  <FormError v-if="loadError" :message="loadError" />
  <Skeleton v-else-if="!entry" class="h-64" />
  <div v-else class="grid gap-6">
    <header class="grid gap-3">
      <RouterLink
        v-if="isCollection"
        :to="`/espaces/${space}/contenu/${type.slug}`"
        class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" class="size-4" />{{ type.name }}
      </RouterLink>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ isCollection ? title || 'Sans titre' : type.name }}
        </h1>
        <StatusBadges :status="status" :en-complete="enComplete" />
      </div>
      <p class="text-sm text-muted-foreground">
        <template v-if="state === 'saving'">Enregistrement…</template>
        <template v-else-if="state === 'saved' && !pending">Enregistré à {{ savedAt }}</template>
        <template v-else-if="state === 'saved'">Modifications en cours…</template>
      </p>
      <!-- Seuls les échecs sont annoncés (Alert porte role="alert") : une annonce à chaque frappe
         saturerait les lecteurs d'écran. -->
      <Alert v-if="state === 'error'" variant="destructive">
        <AlertDescription class="flex flex-wrap items-center gap-3">
          Non enregistré : {{ saveError }}
          <Button size="sm" variant="outline" @click="save">Réessayer</Button>
        </AlertDescription>
      </Alert>
      <Alert v-else-if="state === 'conflict'" variant="destructive">
        <AlertDescription class="flex flex-wrap items-center gap-3">
          Cette entrée a été modifiée ailleurs (un autre onglet ou un autre membre). Vos dernières
          modifications ne sont pas enregistrées.
          <Button size="sm" variant="outline" @click="load">Recharger la dernière version</Button>
        </AlertDescription>
      </Alert>
    </header>

    <div v-if="isCollection" class="grid max-w-md gap-1.5">
      <Label for="entry-slug">Identifiant d’URL</Label>
      <Input id="entry-slug" v-model="slug" class="font-mono" aria-describedby="entry-slug-hint" />
      <p id="entry-slug-hint" class="text-sm text-muted-foreground">
        {{
          entry.publishedAt
            ? 'Le changer casse les liens déjà partagés vers cette entrée.'
            : 'Suit le titre français jusqu’à la première publication.'
        }}
      </p>
    </div>

    <section aria-label="Champs" class="grid gap-2">
      <div class="flex gap-1 md:hidden" role="group" aria-label="Langue affichée">
        <Button
          v-for="l in ['fr', 'en'] as const"
          :key="l"
          size="sm"
          :variant="lang === l ? 'default' : 'outline'"
          :aria-pressed="lang === l"
          @click="lang = l"
        >
          {{ l === 'fr' ? 'Français' : 'English' }}
        </Button>
      </div>
      <div
        class="hidden border-b pb-2 text-sm text-muted-foreground md:grid md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-4"
        aria-hidden="true"
      >
        <span />
        <span>Français</span>
        <span lang="en">English</span>
      </div>
      <p v-if="!type.fields.length" class="text-sm text-muted-foreground">
        Ce type n’a encore aucun champ.
      </p>
      <FieldRows v-model="data" :fields="type.fields" id-prefix="entry" :lang="lang" />
    </section>
  </div>
</template>
