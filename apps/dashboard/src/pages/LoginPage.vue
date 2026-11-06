<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthShell from '@/components/AuthShell.vue'
import FormError from '@/components/FormError.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { homePath, safeReturn } from '@/lib/navigation'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const pending = ref(false)

function messageFor(err: unknown) {
  if (err instanceof ApiError) {
    // Un seul message pour les deux cas : ne pas dire lequel des deux champs est faux.
    if (err.status === 401) return 'Email ou mot de passe incorrect'
    if (err.status === 429) return 'Trop de tentatives, réessayez dans quelques minutes'
    if (err.status === 400) return 'Saisissez une adresse email valide'
  }
  return 'Le serveur ne répond pas. Réessayez dans un instant.'
}

async function submit() {
  error.value = ''
  pending.value = true
  try {
    await session.login(email.value, password.value)
    await router.replace(safeReturn(route.query.retour) ?? homePath(session.me!))
  } catch (err) {
    error.value = messageFor(err)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthShell title="Connexion">
    <form class="grid gap-4" novalidate @submit.prevent="submit">
      <FormError :message="error" />
      <div class="grid gap-2">
        <Label for="email">Email</Label>
        <Input id="email" v-model="email" type="email" autocomplete="username" required />
      </div>
      <div class="grid gap-2">
        <Label for="password">Mot de passe</Label>
        <Input
          id="password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>
      <Button type="submit" :disabled="pending">
        {{ pending ? 'Connexion…' : 'Se connecter' }}
      </Button>
      <p class="text-sm text-muted-foreground">
        Mot de passe oublié ? Demandez un lien de réinitialisation à votre administrateur.
      </p>
    </form>
  </AuthShell>
</template>
