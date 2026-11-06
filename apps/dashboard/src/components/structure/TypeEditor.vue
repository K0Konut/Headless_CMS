<script setup lang="ts">
import { createContentTypeSchema, updateContentTypeSchema } from '@dashility/shared'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import FormError from '@/components/FormError.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import type { ContentType } from '@/lib/content'
import { slugify } from '@/lib/slug'
import FieldList from './FieldList.vue'

const props = defineProps<{
  space: string
  /** null : création d'un type. */
  type: ContentType | null
}>()
const emit = defineEmits<{ saved: [ContentType]; deleted: [string] }>()

const isNew = computed(() => !props.type)

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
      <h2 class="text-lg font-semibold">{{ type?.name ?? 'Nouveau type' }}</h2>
      <FormError :message="error" />
      <Alert v-if="done && !dirty" role="status">
        <AlertDescription>Type enregistré.</AlertDescription>
      </Alert>

      <div class="grid max-w-xl gap-4 sm:grid-cols-2">
        <div class="grid gap-1.5">
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
        <div class="grid gap-1.5">
          <Label for="type-slug">Identifiant</Label>
          <Input
            id="type-slug"
            v-model="form.slug"
            :disabled="!isNew"
            maxlength="50"
            class="font-mono"
            aria-describedby="type-slug-hint"
          />
          <p id="type-slug-hint" class="text-sm text-muted-foreground">
            {{
              isNew
                ? 'Utilisé par l’API. Figé après la création.'
                : 'Figé : l’API et les sites l’utilisent.'
            }}
          </p>
        </div>
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
      <p v-else class="text-sm text-muted-foreground">
        {{ form.kind === 'collection' ? 'Collection' : 'Page unique' }}, figée depuis la création.
      </p>

      <div v-if="form.kind === 'collection'" class="grid max-w-xs gap-1.5">
        <Label for="type-entry">Une entrée</Label>
        <Input
          id="type-entry"
          v-model="form.entryLabel"
          maxlength="100"
          aria-describedby="type-entry-hint"
        />
        <p id="type-entry-hint" class="text-sm text-muted-foreground">
          Avec son article : « un projet » donne le bouton « Ajouter un projet ».
        </p>
      </div>

      <section aria-labelledby="fields-title" class="grid gap-3">
        <h3 id="fields-title" class="font-semibold">Champs</h3>
        <!-- Recréée à chaque enregistrement : les champs ajoutés deviennent alors figés. -->
        <FieldList
          :key="type?.updatedAt ?? 'nouveau'"
          v-model="form.fields"
          id-prefix="field"
          :saved="type?.fields ?? []"
          allow-group
        />
      </section>

      <div class="flex flex-wrap gap-2 border-t pt-6">
        <Button type="submit" :disabled="pending">
          {{ pending ? 'Enregistrement…' : isNew ? 'Créer le type' : 'Enregistrer le type' }}
        </Button>
        <Button
          v-if="!isNew"
          type="button"
          variant="outline"
          :disabled="!dirty || pending"
          @click="reset"
        >
          Annuler les modifications
        </Button>
      </div>
    </form>

    <section v-if="type" aria-labelledby="type-delete-title" class="grid gap-4 border-t pt-8">
      <h3 id="type-delete-title" class="font-semibold">Supprimer le type</h3>
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
