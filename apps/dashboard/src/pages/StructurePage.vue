<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import FormError from '@/components/FormError.vue'
import MoveButtons from '@/components/MoveButtons.vue'
import TypeEditor from '@/components/structure/TypeEditor.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { type ContentType, moveItem } from '@/lib/content'

const route = useRoute()
const router = useRouter()

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

// Sans type choisi : le premier, s'il y en a un.
watch([types, selected], () => {
  if (types.value?.length && !selected.value) {
    void router.replace(`${base.value}/${types.value[0]!.slug}`)
  }
})

const current = computed(() => types.value?.find((t) => t.slug === selected.value))

function onSaved(saved: ContentType) {
  const list = types.value!
  const index = list.findIndex((t) => t.slug === saved.slug)
  if (index === -1) {
    list.push(saved)
    void router.replace(`${base.value}/${saved.slug}`)
  } else {
    list[index] = saved
  }
}

function onDeleted(slug: string) {
  types.value = types.value!.filter((t) => t.slug !== slug)
  void router.replace(base.value)
}

async function move(index: number, delta: -1 | 1) {
  const list = types.value!
  const previous = [...list]
  moveItem(list, index, delta)
  orderError.value = ''
  try {
    await api(`/spaces/${encodeURIComponent(space.value)}/type-order`, {
      method: 'PUT',
      body: { slugs: list.map((t) => t.slug) },
    })
  } catch (err) {
    types.value = previous
    orderError.value = errorMessage(err)
  }
}
</script>

<template>
  <h1 class="text-2xl font-semibold tracking-tight">Structure</h1>
  <p class="mt-1 max-w-prose text-sm text-muted-foreground">
    Les types de contenu de l’espace et leurs champs. Les membres remplissent ces champs dans
    Contenu, sans pouvoir les modifier.
  </p>

  <FormError v-if="error" :message="error" class="mt-6 max-w-md" />
  <Skeleton v-else-if="!types" class="mt-8 h-64" />

  <div
    v-else-if="!types.length && selected !== 'nouveau'"
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

  <div v-else class="mt-8 grid items-start gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
    <nav aria-label="Types de contenu" class="grid gap-3">
      <FormError :message="orderError" />
      <ol class="grid gap-1">
        <li v-for="(type, i) in types" :key="type.slug" class="flex items-center gap-1">
          <RouterLink
            :to="`${base}/${type.slug}`"
            class="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent aria-[current=page]:font-medium"
            :aria-current="type.slug === selected ? 'page' : undefined"
          >
            {{ type.name }}
          </RouterLink>
          <MoveButtons
            :name="type.name"
            :index="i"
            :length="types.length"
            @move="move(i, $event)"
          />
        </li>
      </ol>
      <Button variant="outline" size="sm" class="justify-self-start" as-child>
        <RouterLink :to="`${base}/nouveau`"><Plus aria-hidden="true" />Nouveau type</RouterLink>
      </Button>
    </nav>

    <div class="min-w-0">
      <TypeEditor
        v-if="selected === 'nouveau' || current"
        :space="space"
        :type="current ?? null"
        @saved="onSaved"
        @deleted="onDeleted"
      />
      <p v-else-if="selected">Ce type n’existe pas, ou a été supprimé.</p>
    </div>
  </div>
</template>
