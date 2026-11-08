<script setup lang="ts">
import {
  type EntryData,
  entrySlugSchema,
  entryStatus,
  entryTitle,
  isEnComplete,
  publicationIssues,
  publicationMessage,
} from '@dashility/shared'
import { ArrowLeft, CalendarClock, Ellipsis, Trash2, Undo2 } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import FormError from '@/components/FormError.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError, api, errorMessage } from '@/lib/api'
import { type ContentType, type Entry, READONLY_KEY } from '@/lib/content'
import { formatLongDateTime, formatTime } from '@/lib/format'
import { slugify } from '@/lib/slug'
import FieldRows from './FieldRows.vue'
import DeployStatus from './DeployStatus.vue'
import SchedulePanel from './SchedulePanel.vue'
import StatusBadges from './StatusBadges.vue'

const props = defineProps<{ space: string; type: ContentType; entryId: string }>()
const router = useRouter()

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
/** Identifiant d'URL refusé (déjà pris) : le contenu est enregistré, pas l'identifiant. */
const slugError = ref('')
/** Format invalide : l'identifiant n'est pas envoyé, l'entrée garde le précédent. */
const slugInvalid = computed(() =>
  slug.value ? !entrySlugSchema.safeParse(slug.value).success : false,
)
// Ce qui a été chargé ou enregistré en dernier : la saisie est « en attente » tant qu'elle en
// diffère (revenir à la valeur enregistrée n'a donc rien à envoyer).
const snapshot = () => JSON.stringify([data.value, slug.value])
const lastSaved = ref('')
const pending = computed(() => !!entry.value && snapshot() !== lastSaved.value)
let timer: ReturnType<typeof setTimeout> | undefined
let loading = false
/** Sauvegarde en cours : partir de l'écran l'attend au lieu de croire la saisie perdue. */
let inFlight: Promise<void> | null = null

async function load() {
  loading = true
  loadError.value = ''
  clearTimeout(timer)
  try {
    apply(await api<Entry>(base.value))
    state.value = 'saved'
    slugError.value = ''
  } catch (err) {
    loadError.value = errorMessage(err)
  }
  await nextTick()
  loading = false
}
watch(base, load, { immediate: true })

/** Affiche une entrée lue ou renvoyée par une action : on reprend là où on s'était arrêté, les
 *  modifications en attente, sinon la version publiée. */
function apply(loaded: Entry) {
  entry.value = loaded
  version = loaded.version
  data.value = structuredClone(loaded.draft ?? loaded.published ?? {})
  slug.value = loaded.draftSlug ?? loaded.slug ?? ''
  lastSaved.value = snapshot()
}

const title = computed(() => entryTitle(props.type.fields, data.value))

// L'identifiant d'URL suit le titre tant que l'entrée n'a jamais été publiée et qu'il est celui
// généré à partir du titre (document UX, « Identifiant d'URL »).
watch(title, (next, previous) => {
  if (loading || !isCollection.value || entry.value?.publishedAt) return
  if (slug.value === slugify(previous)) slug.value = slugify(next)
})

// Sauvegarde automatique, une seconde après la dernière modification.
watch(snapshot, () => {
  clearTimeout(timer)
  if (pending.value) timer = setTimeout(save, 1000)
})

function save(): Promise<void> {
  clearTimeout(timer)
  if (inFlight) return inFlight
  if (!pending.value || state.value === 'conflict') return Promise.resolve()
  inFlight = send().finally(() => (inFlight = null))
  return inFlight
}

async function send() {
  const sent = snapshot()
  state.value = 'saving'
  // Identifiant mal formé : on garde le précédent plutôt que de refuser tout l'enregistrement.
  const nextSlug = slugInvalid.value
    ? (entry.value!.draftSlug ?? entry.value!.slug)
    : slug.value || null
  try {
    const saved = await api<Entry & { slugError?: string }>(base.value, {
      method: 'PATCH',
      body: { version, data: data.value, ...(isCollection.value && { slug: nextSlug }) },
    })
    version = saved.version
    entry.value = saved
    lastSaved.value = sent
    state.value = 'saved'
    saveError.value = ''
    slugError.value = saved.slugError ?? ''
  } catch (err) {
    if (await reloadIfStale(err)) return
    const conflict = err instanceof ApiError && err.status === 409
    state.value = conflict ? 'conflict' : 'error'
    saveError.value = conflict ? '' : errorMessage(err)
    return
  }
  // Des modifications sont arrivées pendant l'envoi.
  if (pending.value) timer = setTimeout(save, 1000)
}

const status = computed(() => (entry.value ? entryStatus(entry.value) : 'draft'))
const enComplete = computed(() => isEnComplete(props.type.fields, data.value))
const savedAt = computed(() => (entry.value ? formatTime(entry.value.updatedAt) : ''))

// ── Publication (document UX, « Éditeur d'entrée ») ──────────────────────────────────────

/** Les contrôles de publication s'affichent après une première tentative, puis suivent la
 *  saisie : un champ corrigé perd son erreur. */
const checking = ref(false)
const issues = computed(() =>
  checking.value ? publicationIssues(props.type, data.value, slug.value || null) : [],
)
const errors = computed(() => Object.fromEntries(issues.value.map((i) => [i.path, i.message])))
const slugIssue = computed(() => errors.value.slug)

const busy = ref(false)
const actionError = ref('')
const deployRefresh = ref(0)
/** Annonce des actions réussies aux lecteurs d'écran (document UX : « Publié » est annoncé). */
const announcement = ref('')
let deleted = false

/** Focus sur la saisie d'un chemin, sinon sur son parent (`duration.start` → `duration`,
 *  un groupe → son conteneur). */
async function focusPath(path: string) {
  await nextTick()
  const parts = path.split('.')
  while (parts.length) {
    const el = document.getElementById(['entry', ...parts].join('-'))
    if (el) return el.focus()
    parts.pop()
  }
}

/** Avant une action, la saisie doit être enregistrée : l'API agit sur la version qu'elle a. */
async function saveFirst() {
  actionError.value = ''
  await save()
  if (state.value === 'saved' && !pending.value) return true
  if (state.value !== 'conflict') {
    actionError.value = 'La saisie n’est pas enregistrée : réessayez avant de continuer.'
  }
  return false
}

/** Action sur l'entrée (publier, programmer…) : l'entrée renvoyée par l'API remplace l'affichée,
 *  et l'action réussie est annoncée. */
/** La programmation a changé ailleurs (programmée dans un autre onglet, ou déjà publiée par la
 *  tâche) : on relit l'entrée, dont l'état s'explique de lui-même. */
async function reloadIfStale(err: unknown) {
  if (!(err instanceof ApiError) || !['entry_scheduled', 'not_scheduled'].includes(err.code)) {
    return false
  }
  await load()
  return true
}

async function act(
  path: 'publish' | 'discard' | 'unpublish' | 'schedule',
  done: string,
  request: { method: 'POST' | 'PUT' | 'DELETE'; body?: object } = {
    method: 'POST',
    body: { version },
  },
) {
  busy.value = true
  actionError.value = ''
  try {
    apply(await api<Entry>(`${base.value}/${path}`, request))
    checking.value = false
    announcement.value = done
    // Publier ou dépublier demande un déploiement : son état est relu.
    if (path === 'publish' || path === 'unpublish') deployRefresh.value++
    return true
  } catch (err) {
    if (await reloadIfStale(err)) {
      // L'état relu explique ce qui s'est passé.
    } else if (err instanceof ApiError && err.status === 409) {
      state.value = 'conflict'
    } else {
      actionError.value = errorMessage(err)
    }
    return false
  } finally {
    busy.value = false
  }
}

/** Avant de publier ou de programmer : la saisie est enregistrée, les contrôles de publication
 *  passent, et une version anglaise incomplète est confirmée. */
async function readyToPublish(verb: 'Publier' | 'Programmer') {
  if (!(await saveFirst())) return false
  checking.value = true
  if (issues.value.length) {
    actionError.value = publicationMessage(issues.value)
    void focusPath(issues.value[0]!.path)
    return false
  }
  return (
    enComplete.value ||
    window.confirm(
      `La version anglaise est incomplète : cette entrée sera masquée sur le site en anglais. ${verb} quand même ?`,
    )
  )
}

async function publish() {
  if (!(await readyToPublish('Publier'))) return
  await act('publish', status.value === 'draft' ? 'Entrée publiée.' : 'Modifications publiées.')
}

/** Action confirmée : la saisie est d'abord enregistrée, puis la question posée. */
async function confirmAndAct(action: 'discard' | 'unpublish', question: string, done: string) {
  if ((await saveFirst()) && window.confirm(question)) await act(action, done)
}
const discard = () =>
  confirmAndAct(
    'discard',
    'Annuler les modifications et revenir à la version en ligne ?',
    'Modifications annulées : la version en ligne est rétablie.',
  )
const unpublish = () =>
  confirmAndAct(
    'unpublish',
    'Dépublier cette entrée ? Elle repasse en brouillon et sera retirée du site au prochain déploiement.',
    'Entrée dépubliée : elle est de nouveau en brouillon.',
  )

async function remove() {
  const name = title.value || 'Sans titre'
  if (!window.confirm(`Supprimer « ${name} » ? C’est définitif.`)) return
  busy.value = true
  actionError.value = ''
  try {
    clearTimeout(timer)
    await api(base.value, { method: 'DELETE' })
    deleted = true
    await router.push(`/espaces/${props.space}/contenu/${props.type.slug}`)
  } catch (err) {
    actionError.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}

/** Langue affichée sous 768 px, où les deux colonnes ne tiennent pas. */
const lang = ref<'fr' | 'en'>('fr')

// On ne quitte pas l'éditeur avec une saisie non enregistrée : retour à la liste (même route,
// autre paramètre) comme départ vers un autre écran.
async function confirmLeave() {
  if (deleted) return true
  await save()
  return (
    !pending.value ||
    window.confirm('Vos dernières modifications ne sont pas enregistrées. Quitter quand même ?')
  )
}
onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)

// ── Publication programmée (V3, document UX « Publication programmée ») ───────────────────

/** Classes d'un fieldset figé : ses contrôles désactivés restent lisibles (document UX). */
const FROZEN = '[&_:disabled]:cursor-default [&_:disabled]:opacity-100'

/** Programmée : la version est figée, les champs sont en lecture seule. */
const scheduled = computed(() => !!entry.value?.scheduledAt)
provide(READONLY_KEY, scheduled)
const panelOpen = ref(false)

async function scheduleAt(at: string) {
  if (!(await readyToPublish('Programmer'))) {
    // Des champs à corriger : le panneau se ferme pour les laisser voir.
    if (issues.value.length) panelOpen.value = false
    return
  }
  const done = `Publication programmée le ${formatLongDateTime(at)}.`
  if (await act('schedule', done, { method: 'PUT', body: { version, at } })) {
    panelOpen.value = false
  }
}

const unschedule = (done = 'Programmation annulée.') => act('schedule', done, { method: 'DELETE' })

async function editEntry() {
  if (!window.confirm('Modifier l’entrée annule la publication programmée. Continuer ?')) return
  await unschedule('Programmation annulée : l’entrée est modifiable.')
}

/** Issue de la dernière programmation, tant que l'entrée n'a pas été réécrite. */
const outcome = computed(() => {
  const last = entry.value?.lastSchedule
  if (!last || scheduled.value) return null
  const planned = formatLongDateTime(last.plannedAt)
  const late = Date.parse(last.at) - Date.parse(last.plannedAt) > 2 * 60_000
  if (last.outcome === 'published') {
    return {
      error: false,
      text: late
        ? `Publiée le ${formatLongDateTime(last.at)}, au lieu du ${planned} (le serveur était arrêté).`
        : `Publiée le ${planned}, comme prévu.`,
    }
  }
  if (last.outcome === 'cancelled') {
    return {
      error: false,
      text: `La publication programmée du ${planned} a été annulée : l’entrée a été modifiée (par un membre ou par un changement de structure).`,
      again: true,
    }
  }
  return {
    error: true,
    text: `La publication programmée du ${planned} a échoué : ${last.message ?? 'erreur inconnue'}.`,
  }
})

/** Relit l'entrée après l'heure prévue. Pas encore traitée (serveur arrêté ou en retard) : on
 *  réessaie dans une minute. */
async function checkOutcome() {
  await load()
  const at = entry.value?.scheduledAt
  if (at && Date.parse(at) < Date.now()) outcomeTimer = setTimeout(checkOutcome, 60_000)
}

// Une fois l'heure prévue passée, l'issue est relue (la tâche passe chaque minute).
let outcomeTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => entry.value?.scheduledAt,
  (at) => {
    clearTimeout(outcomeTimer)
    if (!at) return
    const wait = Math.max(0, Date.parse(at) - Date.now() + 75_000)
    // setTimeout ne sait pas attendre plus de 24 jours : au-delà, on relira à la prochaine visite.
    if (wait < 2 ** 31 - 1) outcomeTimer = setTimeout(checkOutcome, wait)
  },
)
const onUnload = (event: BeforeUnloadEvent) => {
  if (pending.value || state.value === 'saving') event.preventDefault()
}
window.addEventListener('beforeunload', onUnload)
onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(outcomeTimer)
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
        <StatusBadges
          :status="status"
          :en-complete="enComplete"
          :scheduled-at="entry.scheduledAt"
        />
      </div>
      <p class="text-sm text-muted-foreground">
        <template v-if="state === 'saving'">Enregistrement…</template>
        <template v-else-if="state === 'saved' && !pending">Enregistré à {{ savedAt }}</template>
        <template v-else-if="state === 'saved'">Modifications en cours…</template>
      </p>
      <DeployStatus :space="space" :refresh-key="deployRefresh" />
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="status === 'modified'">
          <Button v-if="!scheduled" variant="outline" :disabled="busy" @click="discard">
            <Undo2 aria-hidden="true" />Annuler les modifications
          </Button>
          <Button :disabled="busy" @click="publish">Publier les modifications</Button>
        </template>
        <Button v-else-if="status === 'draft'" :disabled="busy" @click="publish">Publier</Button>
        <Button
          v-if="status !== 'published' && !scheduled"
          variant="outline"
          :disabled="busy"
          :aria-expanded="panelOpen"
          @click="panelOpen = !panelOpen"
        >
          <CalendarClock aria-hidden="true" />Programmer…
        </Button>
        <DropdownMenu v-if="status !== 'draft' || isCollection">
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="icon" :disabled="busy" aria-label="Autres actions">
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem v-if="status !== 'draft' && !scheduled" @select="unpublish">
              <Undo2 aria-hidden="true" />Dépublier
            </DropdownMenuItem>
            <DropdownMenuItem v-if="isCollection" variant="destructive" @select="remove">
              <Trash2 aria-hidden="true" />Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SchedulePanel
        v-if="panelOpen"
        :initial="entry.scheduledAt"
        :busy="busy"
        @submit="scheduleAt"
        @cancel="panelOpen = false"
      />
      <div
        v-if="scheduled && !panelOpen"
        class="grid gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm"
      >
        <p class="flex items-start gap-2">
          <CalendarClock aria-hidden="true" class="mt-0.5 size-4 shrink-0" />
          <span>
            Publication programmée le
            <strong>{{ formatLongDateTime(entry.scheduledAt!) }}</strong> (heure de Paris). Les
            champs sont en lecture seule.
          </span>
        </p>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" :disabled="busy" @click="panelOpen = true">
            Changer la date
          </Button>
          <Button size="sm" variant="outline" :disabled="busy" @click="unschedule()">
            Annuler la programmation
          </Button>
          <Button size="sm" variant="outline" :disabled="busy" @click="editEntry">
            Modifier l’entrée
          </Button>
        </div>
      </div>
      <div
        v-else-if="outcome"
        class="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm"
        :class="outcome.error ? 'border-destructive/50 text-destructive' : ''"
      >
        <span>{{ outcome.text }}</span>
        <Button
          v-if="outcome.again"
          size="sm"
          variant="outline"
          :disabled="busy"
          @click="panelOpen = true"
        >
          Programmer à nouveau
        </Button>
      </div>
      <p role="status" class="sr-only">{{ announcement }}</p>
      <FormError :message="actionError" />
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

    <!-- Programmée : lecture seule. Le fieldset désactive tous ses contrôles ; ils restent lisibles. -->
    <fieldset v-if="isCollection" :disabled="scheduled" :class="['grid max-w-md gap-1.5', FROZEN]">
      <Label for="entry-slug">Identifiant d’URL</Label>
      <Input
        id="entry-slug"
        v-model="slug"
        class="font-mono"
        :aria-invalid="slugInvalid || !!slugError || !!slugIssue || undefined"
        aria-describedby="entry-slug-hint entry-slug-error"
      />
      <p
        v-if="slugInvalid || slugError || slugIssue"
        id="entry-slug-error"
        class="text-sm text-destructive"
      >
        {{ slugInvalid ? 'Minuscules, chiffres et tirets uniquement.' : slugError || slugIssue }}
      </p>
      <p id="entry-slug-hint" class="text-sm text-muted-foreground">
        {{
          entry.published
            ? `En ligne : ${entry.slug}. Un nouvel identifiant ne s’applique qu’à la publication, et casse alors les liens déjà partagés.`
            : entry.publishedAt
              ? 'Figé depuis la première publication. Le changer casse les liens déjà partagés.'
              : 'Suit le titre français jusqu’à la première publication.'
        }}
      </p>
    </fieldset>

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
      <fieldset :disabled="scheduled" :class="['min-w-0', FROZEN]">
        <legend class="sr-only">
          {{ scheduled ? 'Champs (lecture seule : publication programmée)' : 'Champs' }}
        </legend>
        <FieldRows
          v-model="data"
          :fields="type.fields"
          id-prefix="entry"
          :lang="lang"
          :errors="errors"
        />
      </fieldset>
    </section>
  </div>
</template>
