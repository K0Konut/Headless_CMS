<script setup lang="ts">
import type { DeployState } from '@dashility/shared'
import { CircleAlert } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import { deployLabel } from '@/lib/deploy'
import { useSessionStore } from '@/stores/session'

/** État du dernier appel de déploiement, dans l'en-tête de l'éditeur (document UX,
 *  « Déploiement »). `refreshKey` change après une action qui demande un déploiement. */
const props = defineProps<{ space: string; refreshKey: number }>()
const session = useSessionStore()

const state = ref<DeployState | null>(null)
const busy = ref(false)
const error = ref('')
let poll: ReturnType<typeof setTimeout> | undefined
let unmounted = false
const base = computed(() => `/spaces/${encodeURIComponent(props.space)}/deploy`)

async function load() {
  clearTimeout(poll)
  try {
    state.value = await api<DeployState>(base.value)
    // Un appel est attendu (regroupement de 10 s) : on relit jusqu'à son résultat, tant que
    // l'éditeur est affiché (la réponse peut arriver après qu'on l'a quitté).
    if (state.value.pending && !unmounted) poll = setTimeout(load, 2000)
  } catch {
    // L'état du déploiement est secondaire : l'éditeur reste utilisable sans lui.
  }
}
watch(() => [props.space, props.refreshKey], load, { immediate: true })
onBeforeUnmount(() => {
  unmounted = true
  clearTimeout(poll)
})

async function relaunch() {
  busy.value = true
  error.value = ''
  try {
    state.value = await api<DeployState>(base.value, { method: 'POST' })
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}

const failed = computed(() => !!state.value?.last && !state.value.last.ok && !state.value.pending)
</script>

<template>
  <div v-if="state" class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
    <span v-if="failed" role="alert" class="flex items-center gap-1 text-destructive">
      <CircleAlert aria-hidden="true" class="size-4" />{{ deployLabel(state) }}
    </span>
    <span v-else>{{ deployLabel(state) }}</span>
    <RouterLink
      v-if="!state.configured && session.me?.user.isSuperAdmin"
      :to="`/espaces/${space}/reglages#integration`"
      class="underline underline-offset-4"
    >
      Régler le déploiement
    </RouterLink>
    <Button v-if="failed" size="sm" variant="outline" :disabled="busy" @click="relaunch">
      {{ busy ? 'Relance…' : 'Relancer' }}
    </Button>
    <span v-if="error" class="text-destructive">{{ error }}</span>
  </div>
</template>
