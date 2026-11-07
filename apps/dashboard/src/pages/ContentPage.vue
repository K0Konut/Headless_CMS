<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import FormError from '@/components/FormError.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import type { ContentType } from '@/lib/content'
import { plural } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()
const space = computed(() => String(route.params.espace))

const types = ref<ContentType[] | null>(null)
const error = ref('')
watch(
  space,
  async () => {
    types.value = null
    error.value = ''
    try {
      types.value = await api<ContentType[]>(`/spaces/${encodeURIComponent(space.value)}/types`)
    } catch (err) {
      error.value = errorMessage(err)
    }
  },
  { immediate: true },
)

// Un type sans champ n'apparaît pas tant qu'il n'a aucun champ (document UX, « Structure »).
const ready = computed(() => types.value?.filter((t) => t.fields.length) ?? [])
</script>

<template>
  <h1 class="text-2xl font-semibold tracking-tight">Contenu</h1>

  <FormError v-if="error" :message="error" class="mt-6 max-w-md" />
  <div v-else-if="!types" class="mt-8 grid gap-4 sm:grid-cols-2">
    <Skeleton v-for="i in 4" :key="i" class="h-24" />
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

  <ul v-else class="mt-8 grid gap-4 sm:grid-cols-2">
    <li v-for="type in ready" :key="type.slug">
      <RouterLink
        :to="`/espaces/${space}/contenu/${type.slug}`"
        class="grid h-full gap-2 rounded-lg border bg-card p-4 outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span class="flex items-baseline justify-between gap-2">
          <span class="font-semibold">{{ type.name }}</span>
          <span class="text-sm text-muted-foreground">
            {{ type.kind === 'collection' ? 'Collection' : 'Page unique' }}
          </span>
        </span>
        <span v-if="type.kind === 'collection'" class="text-sm text-muted-foreground">
          <template v-if="type.counts.total">
            {{ plural(type.counts.published, 'publié') }},
            {{ plural(type.counts.total - type.counts.published, 'brouillon') }}
          </template>
          <template v-else>Aucune entrée</template>
        </span>
        <span v-else class="text-sm text-muted-foreground">
          {{ type.counts.published ? 'Publiée' : 'Brouillon' }}
        </span>
        <span v-if="type.counts.enIncomplete" class="text-sm">
          {{ plural(type.counts.enIncomplete, 'EN incomplet') }}
        </span>
      </RouterLink>
    </li>
  </ul>
</template>
