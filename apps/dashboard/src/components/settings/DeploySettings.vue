<script setup lang="ts">
import { type DeployState, deploySettingsSchema } from '@dashility/shared'
import { Rocket } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import FormError from '@/components/FormError.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { deployLabel } from '@/lib/deploy'

/** URL de déploiement (document UX, « Réglages › Intégration ») : l'adresse appelée à chaque
 *  publication, avec un jeton facultatif qui n'est jamais réaffiché. */
const props = defineProps<{ slug: string }>()
// Suit un renommage de l'espace fait dans la même page.
const base = computed(() => `/spaces/${encodeURIComponent(props.slug)}/deploy`)

const state = ref<DeployState | null>(null)
const url = ref('')
const token = ref('')
const error = ref('')
const saved = ref(false)
const pending = ref(false)

function show(next: DeployState) {
  state.value = next
  url.value = next.url ?? ''
  token.value = ''
}

onMounted(async () => {
  try {
    show(await api<DeployState>(base.value))
  } catch (err) {
    error.value = errorMessage(err)
  }
})

async function send(body: unknown, method: 'PUT' | 'POST' = 'PUT') {
  pending.value = true
  error.value = ''
  saved.value = false
  try {
    show(await api<DeployState>(base.value, { method, body }))
    saved.value = method === 'PUT'
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
}

function save() {
  const parsed = deploySettingsSchema.safeParse({
    url: url.value.trim() || null,
    // Champ laissé vide : le jeton enregistré reste tel quel.
    ...(token.value.trim() && { token: token.value.trim() }),
  })
  if (!parsed.success) {
    error.value = parsed.error.issues[0]?.message ?? 'Réglages invalides'
    return
  }
  void send(parsed.data)
}
</script>

<template>
  <div class="grid grid-cols-1 gap-3">
    <p class="text-sm font-medium">Déploiement à la publication</p>
    <p class="text-sm text-muted-foreground">
      Appelée à chaque publication, regroupée sur 10 s : un hook de build (Netlify, Vercel…) ou
      l’API <code class="rounded bg-muted px-1">repository_dispatch</code> de GitHub. Laissez vide
      pour un site qui lit l’API à chaque visite.
    </p>
    <FormError :message="error" />
    <Alert v-if="saved" role="status">
      <AlertDescription>Réglages du déploiement enregistrés.</AlertDescription>
    </Alert>
    <form class="grid max-w-xl gap-3" novalidate @submit.prevent="save">
      <div class="grid gap-1.5">
        <Label for="deploy-url">URL de déploiement</Label>
        <Input
          id="deploy-url"
          v-model="url"
          type="url"
          inputmode="url"
          placeholder="https://api.github.com/repos/moi/site/dispatches"
        />
      </div>
      <div class="grid gap-1.5">
        <Label for="deploy-token">Jeton (facultatif)</Label>
        <Input
          id="deploy-token"
          v-model="token"
          type="password"
          autocomplete="off"
          aria-describedby="deploy-token-hint"
          :placeholder="state?.hasToken ? 'Jeton enregistré' : ''"
        />
        <p id="deploy-token-hint" class="text-sm text-muted-foreground">
          Envoyé en <code class="rounded bg-muted px-1">Authorization: Bearer</code>. Pour GitHub :
          un jeton à grain fin limité au dépôt du site, permission « Contents » en écriture.
          {{ state?.hasToken ? 'Laisser vide garde le jeton enregistré.' : '' }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button type="submit" :disabled="pending">Enregistrer</Button>
        <Button
          v-if="state?.hasToken"
          type="button"
          variant="outline"
          :disabled="pending"
          @click="send({ url: state.url ?? null, token: null })"
        >
          Retirer le jeton
        </Button>
      </div>
    </form>
    <div v-if="state?.configured" class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-muted-foreground">{{ deployLabel(state) }}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="pending"
        @click="send(undefined, 'POST')"
      >
        <Rocket aria-hidden="true" />{{ pending ? 'Appel…' : 'Lancer un déploiement' }}
      </Button>
    </div>
  </div>
</template>
