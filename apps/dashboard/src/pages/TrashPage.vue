<script setup lang="ts">
import { ArrowLeft, Trash2 } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import FormError from '@/components/FormError.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { type TrashedEntry, entryLabel } from '@/lib/content'
import { formatDate, plural } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

/** Corbeille de l'espace (V4, document UX « Corbeille ») : les membres restaurent, en brouillon ;
 *  seul le super-admin supprime pour de bon. */
const route = useRoute()
const session = useSessionStore()
const space = computed(() => String(route.params.espace))
const base = computed(() => `/spaces/${encodeURIComponent(space.value)}/trash`)
const isSuperAdmin = computed(() => !!session.me?.user.isSuperAdmin)

const entries = ref<TrashedEntry[] | null>(null)
const error = ref('')
const busy = ref(false)
/** Dernière restauration, avec le lien pour ouvrir l'entrée. */
const restored = ref<{ title: string; to: string } | null>(null)

async function load() {
  entries.value = null
  error.value = ''
  try {
    entries.value = await api<TrashedEntry[]>(base.value)
  } catch (err) {
    error.value = errorMessage(err)
  }
}
watch(base, load, { immediate: true })

const DAY_MS = 24 * 60 * 60 * 1000
const daysLeft = (entry: TrashedEntry) =>
  Math.max(1, Math.ceil((Date.parse(entry.purgeAt) - Date.now()) / DAY_MS))
const label = (entry: TrashedEntry) => entryLabel(entry.type.name, entry.title)

/** Action sur la corbeille ; les entrées traitées (toutes sans `id`) quittent la liste. */
async function run(action: () => Promise<unknown>, id?: string) {
  busy.value = true
  error.value = ''
  restored.value = null
  try {
    await action()
    entries.value = id ? entries.value!.filter((e) => e.id !== id) : []
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}

const restore = (entry: TrashedEntry) =>
  run(async () => {
    await api(`${base.value}/${entry.id}/restore`, { method: 'POST' })
    restored.value = {
      title: entry.title || 'Sans titre',
      to: `/espaces/${space.value}/contenu/${entry.type.slug}/${entry.id}`,
    }
  }, entry.id)

function destroy(entry: TrashedEntry) {
  const question = `Supprimer définitivement « ${entry.title || 'Sans titre'} » ? C’est irréversible : son historique est effacé aussi.`
  if (window.confirm(question)) {
    void run(() => api(`${base.value}/${entry.id}`, { method: 'DELETE' }), entry.id)
  }
}

function empty() {
  const question = `Vider la corbeille ? Tout son contenu (${plural(entries.value!.length, 'entrée')}) sera supprimé définitivement, historique compris.`
  if (window.confirm(question)) void run(() => api(base.value, { method: 'DELETE' }))
}
</script>

<template>
  <div class="grid gap-5">
    <header class="grid gap-3">
      <RouterLink
        :to="`/espaces/${space}/contenu`"
        class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" class="size-4" />Contenu
      </RouterLink>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <h1 class="text-2xl font-semibold tracking-tight">Corbeille</h1>
        <Button
          v-if="isSuperAdmin && entries?.length"
          variant="outline"
          :disabled="busy"
          @click="empty"
        >
          <Trash2 aria-hidden="true" />Vider la corbeille
        </Button>
      </div>
      <p class="text-sm text-muted-foreground">
        Les entrées sont supprimées définitivement 30 jours après leur mise à la corbeille.
        Restaurée, une entrée revient en brouillon.
      </p>
    </header>

    <FormError :message="error" />
    <p v-if="restored" role="status" class="text-sm">
      « {{ restored.title }} » restauré en brouillon.
      <RouterLink :to="restored.to" class="underline underline-offset-4">Ouvrir</RouterLink>
    </p>

    <Skeleton v-if="!entries && !error" class="h-32" />
    <p v-else-if="entries && !entries.length" class="text-muted-foreground">
      La corbeille est vide.
    </p>
    <ul v-else-if="entries" class="overflow-hidden rounded-lg border bg-card">
      <li
        v-for="entry in entries"
        :key="entry.id"
        class="grid items-center gap-x-4 gap-y-1 border-t px-4 py-2.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <div class="grid min-w-0 gap-0.5">
          <span class="truncate font-semibold">{{ label(entry) }}</span>
          <span class="text-sm text-muted-foreground">
            supprimé le {{ formatDate(entry.deletedAt) }}
            {{ entry.deletedBy ? `par ${entry.deletedBy}` : 'par un ancien membre' }} ·
            définitivement dans {{ plural(daysLeft(entry), 'jour') }}
          </span>
        </div>
        <div class="flex gap-2">
          <Button size="sm" variant="outline" :disabled="busy" @click="restore(entry)">
            Restaurer<span class="sr-only"> « {{ label(entry) }} »</span>
          </Button>
          <Button
            v-if="isSuperAdmin"
            size="sm"
            variant="ghost"
            class="text-destructive"
            :disabled="busy"
            :aria-label="`Supprimer définitivement « ${label(entry)} »`"
            @click="destroy(entry)"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </li>
    </ul>
  </div>
</template>
