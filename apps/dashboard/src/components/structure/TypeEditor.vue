<script setup lang="ts">
import { createContentTypeSchema, updateContentTypeSchema } from '@dashility/shared'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ChevronLeft, Lock } from '@lucide/vue'
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import FormError from '@/components/FormError.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { type ContentType, removedFields } from '@/lib/content'
import { plural } from '@/lib/format'
import { slugify } from '@/lib/slug'
import FieldList from './FieldList.vue'
import TypePreview from './TypePreview.vue'

const props = defineProps<{
  space: string
  /** null : création d'un type. */
  type: ContentType | null
}>()
const emit = defineEmits<{ saved: [ContentType]; deleted: [string] }>()

const isNew = computed(() => !props.type)
/** Onglet affiché : les champs, ou l'aperçu de l'éditeur d'entrée (document UX). */
const tab = ref<'fields' | 'preview'>('fields')
/** Flèches gauche et droite entre les deux onglets (motif ARIA des onglets). */
async function switchTab() {
  tab.value = tab.value === 'fields' ? 'preview' : 'fields'
  await nextTick()
  document.getElementById(`type-tab-${tab.value}`)?.focus()
}

/** Copie modifiable du type ; le nom d'entrée vide d'une page unique devient null à l'envoi. */
const copyOf = (type: ContentType | null) => {
  const { slug, kind, name, entryLabel, fields } = type ?? {
    slug: '',
    kind: 'collection' as const,
    name: '',
    entryLabel: '',
    fields: [],
  }
  return JSON.parse(JSON.stringify({ slug, kind, name, entryLabel: entryLabel ?? '', fields }))
}
const form = reactive(copyOf(props.type))
let initial = JSON.stringify(form)
const dirty = computed(() => JSON.stringify(form) !== initial)

const error = ref('')
const deleteError = ref('')
const done = ref(false)
const pending = ref(false)
let removed = false
/** Identifiant du type que cet éditeur vient de créer. */
let createdSlug = ''

// Autre type affiché : on repart de lui. Seul le type que cet éditeur vient de créer garde sa
// saisie et la confirmation (et non un type existant qui aurait le même identifiant).
watch(
  () => props.type?.slug,
  (slug, previous) => {
    if (previous === undefined && slug === createdSlug) return
    createdSlug = ''
    Object.assign(form, copyOf(props.type))
    initial = JSON.stringify(form)
    error.value = ''
    deleteError.value = ''
    done.value = false
    removed = false
  },
)

// À la création, l'identifiant suit le nom tant qu'il est celui généré à partir de lui.
watch(
  () => form.name,
  (name, previous) => {
    if (isNew.value && form.slug === slugify(previous)) form.slug = slugify(name)
  },
)

async function save() {
  done.value = false
  const body = {
    kind: form.kind,
    name: form.name,
    entryLabel: form.kind === 'collection' ? form.entryLabel : null,
    fields: form.fields,
  }
  const parsed = isNew.value
    ? createContentTypeSchema.safeParse({ ...body, slug: form.slug })
    : updateContentTypeSchema.safeParse(body)
  error.value = parsed.success ? '' : (parsed.error.issues[0]?.message ?? 'Champs invalides')
  if (!parsed.success) return
  // Les valeurs des champs et choix supprimés sont effacées des entrées (document UX).
  const removed = props.type ? removedFields(props.type.fields, form.fields) : []
  const total = props.type?.counts.total ?? 0
  if (
    removed.length &&
    total &&
    !window.confirm(
      `Les valeurs de ${removed.map((r) => `« ${r} »`).join(', ')} seront supprimées des entrées qui en ont (le type en compte ${plural(total, 'entrée')}). Enregistrer quand même ?`,
    )
  ) {
    return
  }
  pending.value = true
  try {
    const saved = await api<ContentType>(
      `/spaces/${encodeURIComponent(props.space)}/types${isNew.value ? '' : `/${encodeURIComponent(form.slug)}`}`,
      { method: isNew.value ? 'POST' : 'PUT', body: parsed.data },
    )
    // Avant d'avertir la page : elle change d'URL après une création, sans confirmation à demander.
    initial = JSON.stringify(form)
    done.value = true
    if (isNew.value) createdSlug = saved.slug
    emit('saved', saved)
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
}

function reset() {
  Object.assign(form, JSON.parse(initial))
  error.value = ''
}

async function remove() {
  pending.value = true
  try {
    await api(`/spaces/${encodeURIComponent(props.space)}/types/${encodeURIComponent(form.slug)}`, {
      method: 'DELETE',
    })
    removed = true
    emit('deleted', form.slug)
  } catch (err) {
    deleteError.value = errorMessage(err)
  } finally {
    pending.value = false
  }
}

// Une structure s'enregistre explicitement : on prévient avant de perdre des modifications.
const confirmLeave = () =>
  removed ||
  !dirty.value ||
  window.confirm('Les modifications de ce type ne sont pas enregistrées. Les abandonner ?')
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)
const onUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault()
}
window.addEventListener('beforeunload', onUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', onUnload))
</script>

<template>
  <div class="grid gap-8">
    <form class="grid gap-6" novalidate @submit.prevent="save">
      <div class="grid gap-2">
        <RouterLink
          :to="`/espaces/${space}/structure`"
          class="inline-flex items-center gap-1 justify-self-start rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft class="size-4" aria-hidden="true" />Structure
        </RouterLink>
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="flex-1 text-2xl font-semibold tracking-tight">
            {{ type?.name ?? 'Nouveau type' }}
          </h1>
          <Button
            v-if="!isNew"
            type="button"
            variant="ghost"
            :disabled="!dirty || pending"
            @click="reset"
          >
            Annuler les modifications
          </Button>
          <Button type="submit" :disabled="pending">
            {{ pending ? 'Enregistrement…' : isNew ? 'Créer le type' : 'Enregistrer le type' }}
          </Button>
        </div>
      </div>
      <FormError :message="error" />
      <Alert v-if="done && !dirty" role="status">
        <AlertDescription>Type enregistré.</AlertDescription>
      </Alert>

      <div class="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div class="grid w-full max-w-56 gap-1.5">
          <Label for="type-name">Nom au pluriel</Label>
          <Input
            id="type-name"
            v-model="form.name"
            maxlength="100"
            aria-describedby="type-name-hint"
          />
          <p id="type-name-hint" class="text-sm text-muted-foreground">
            Affiché dans Contenu : « Projets », « À propos ».
          </p>
        </div>
        <div v-if="form.kind === 'collection'" class="grid w-full max-w-56 gap-1.5">
          <Label for="type-entry">Une entrée</Label>
          <Input
            id="type-entry"
            v-model="form.entryLabel"
            maxlength="100"
            aria-describedby="type-entry-hint"
          />
          <p id="type-entry-hint" class="text-sm text-muted-foreground">
            Avec son article : « un projet » donne « Ajouter un projet ».
          </p>
        </div>
        <div v-if="isNew" class="grid w-full max-w-56 gap-1.5">
          <Label for="type-slug">Identifiant</Label>
          <Input
            id="type-slug"
            v-model="form.slug"
            maxlength="50"
            class="font-mono"
            aria-describedby="type-slug-hint"
          />
          <p id="type-slug-hint" class="text-sm text-muted-foreground">
            Utilisé par l’API. Figé après la création.
          </p>
        </div>
        <p
          v-else
          class="flex items-center gap-1.5 pt-7 text-sm text-muted-foreground"
          title="Figés : les entrées, l’API et les sites en dépendent."
        >
          <Lock class="size-3.5" aria-hidden="true" />
          {{ form.kind === 'collection' ? 'Collection' : 'Page unique' }}, identifiant
          <code class="font-mono text-foreground">{{ form.slug }}</code>
          <span class="sr-only">(figés : les entrées, l’API et les sites en dépendent)</span>
        </p>
      </div>

      <fieldset v-if="isNew" class="grid gap-2">
        <legend class="mb-1 text-sm font-medium">Nature</legend>
        <label class="flex items-start gap-2 text-sm">
          <input
            v-model="form.kind"
            type="radio"
            value="collection"
            class="mt-0.5 size-4 accent-primary"
          />
          <span>Collection : plusieurs entrées (projets, articles, expériences)</span>
        </label>
        <label class="flex items-start gap-2 text-sm">
          <input
            v-model="form.kind"
            type="radio"
            value="single"
            class="mt-0.5 size-4 accent-primary"
          />
          <span>Page unique : une seule entrée (accueil, à propos, CV)</span>
        </label>
        <p class="text-sm text-muted-foreground">Figée après la création.</p>
      </fieldset>

      <section class="grid gap-4">
        <div
          role="tablist"
          aria-label="Champs du type"
          class="flex gap-1 border-b"
          @keydown.left.right.prevent="switchTab"
        >
          <button
            v-for="[value, label] in [
              ['fields', 'Champs'],
              ['preview', 'Aperçu'],
            ] as const"
            :id="`type-tab-${value}`"
            :key="value"
            type="button"
            role="tab"
            :aria-selected="tab === value"
            :tabindex="tab === value ? 0 : -1"
            aria-controls="type-tab-panel"
            :class="[
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tab === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ]"
            @click="tab = value"
          >
            {{ label }}
          </button>
        </div>
        <div id="type-tab-panel" role="tabpanel" :aria-labelledby="`type-tab-${tab}`">
          <!-- Recréée à chaque enregistrement : les champs ajoutés deviennent alors figés. -->
          <FieldList
            v-show="tab === 'fields'"
            :key="type?.updatedAt ?? 'nouveau'"
            v-model="form.fields"
            id-prefix="field"
            :saved="type?.fields ?? []"
            allow-group
          />
          <TypePreview v-if="tab === 'preview'" :fields="form.fields" />
        </div>
      </section>
    </form>

    <section
      v-if="type"
      aria-labelledby="type-delete-title"
      class="grid gap-4 rounded-lg border bg-card p-4 sm:p-6"
    >
      <h2 id="type-delete-title" class="font-semibold">Supprimer le type</h2>
      <p class="text-sm text-muted-foreground">
        Le type et toutes ses entrées sont supprimés définitivement.
      </p>
      <ConfirmDelete
        id="type-delete-confirmation"
        :key="type.slug"
        :name="type.name"
        action="Supprimer le type"
        :error="deleteError"
        :pending="pending"
        @confirm="remove"
      />
    </section>
  </div>
</template>
