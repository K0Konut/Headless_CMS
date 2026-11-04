<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthShell from '@/components/AuthShell.vue'
import FormError from '@/components/FormError.vue'
import NewPasswordFields from '@/components/NewPasswordFields.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'
import { homePath } from '@/lib/navigation'
import { newPasswordError } from '@/lib/passwords'
import type { Me, SpaceSummary } from '@/lib/types'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ token: string; kind: 'invitation' | 'reset' }>()

interface Link {
  kind: 'invitation' | 'reset'
  email: string
  space: SpaceSummary | null
}

const session = useSessionStore()
const router = useRouter()

const state = ref<'loading' | 'invalid' | 'form' | 'existing'>('loading')
const link = ref<Link | null>(null)
const password = ref('')
const confirmation = ref('')
const error = ref('')
const pending = ref(false)

const title = computed(() => {
  if (state.value === 'invalid') return 'Lien expiré'
  if (props.kind === 'reset') return 'Nouveau mot de passe'
  return link.value?.space ? `Rejoindre ${link.value.space.name}` : 'Invitation'
})

// Revérifié à chaque changement de jeton : Vue réutilise la page d'un lien à l'autre.
watch(
  () => [props.token, props.kind],
  async () => {
    state.value = 'loading'
    link.value = null
    error.value = password.value = confirmation.value = ''
    try {
      const info = await api<Link>(`/tokens/${encodeURIComponent(props.token)}`)
      link.value = info
      state.value = info.kind === props.kind ? 'form' : 'invalid'
    } catch {
      state.value = 'invalid'
    }
  },
  { immediate: true },
)

async function submit() {
  error.value = newPasswordError(password.value, confirmation.value)
  if (error.value) return
  pending.value = true
  try {
    const me = await api<Me>(`/tokens/${encodeURIComponent(props.token)}`, {
      method: 'POST',
      body: { password: password.value },
    })
    session.me = me
    const space = link.value?.space
    await router.replace(space ? `/espaces/${space.slug}/analytics` : homePath(me))
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) state.value = 'existing'
    else if (err instanceof ApiError && err.status === 404) state.value = 'invalid'
    else error.value = err instanceof ApiError ? err.message : 'Une erreur est survenue'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthShell
    :title="title"
    :description="
      state === 'form'
        ? kind === 'reset'
          ? 'Choisissez le nouveau mot de passe de votre compte.'
          : 'Choisissez le mot de passe de votre compte.'
        : undefined
    "
  >
    <p v-if="state === 'loading'" class="text-sm text-muted-foreground">Vérification du lien…</p>

    <p v-else-if="state === 'invalid'" class="text-sm">
      Ce lien n’est plus valide, demandez-en un nouveau à votre administrateur.
    </p>

    <div v-else-if="state === 'existing'" class="grid gap-4 text-sm">
      <p>
        Un compte existe déjà pour {{ link?.email }} : il a été ajouté à l’espace. Connectez-vous
        avec votre mot de passe habituel.
      </p>
      <Button as-child>
        <RouterLink to="/connexion">Se connecter</RouterLink>
      </Button>
    </div>

    <form v-else class="grid gap-4" novalidate @submit.prevent="submit">
      <FormError :message="error" />
      <div class="grid gap-2">
        <Label for="email">Email</Label>
        <Input
          id="email"
          :model-value="link?.email"
          type="email"
          autocomplete="username"
          readonly
        />
      </div>
      <NewPasswordFields v-model:password="password" v-model:confirmation="confirmation" />
      <Button type="submit" :disabled="pending">
        {{
          pending
            ? 'Enregistrement…'
            : kind === 'reset'
              ? 'Changer le mot de passe'
              : 'Créer mon compte'
        }}
      </Button>
    </form>
  </AuthShell>
</template>
