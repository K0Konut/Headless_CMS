<script setup lang="ts">
import { ref } from 'vue'
import FormError from '@/components/FormError.vue'
import NewPasswordFields from '@/components/NewPasswordFields.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { newPasswordError } from '@/lib/passwords'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const current = ref('')
const password = ref('')
const confirmation = ref('')
const error = ref('')
const done = ref(false)
const pending = ref(false)

async function submit() {
  done.value = false
  error.value = newPasswordError(password.value, confirmation.value)
  if (error.value) return
  pending.value = true
  try {
    await api('/auth/password', {
      method: 'PUT',
      body: { currentPassword: current.value, newPassword: password.value },
    })
    current.value = password.value = confirmation.value = ''
    done.value = true
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <h1 class="text-2xl font-semibold tracking-tight">Mon compte</h1>

  <div class="mt-8 grid max-w-md gap-2">
    <Label for="account-email">Email</Label>
    <Input id="account-email" :model-value="session.me?.user.email" readonly />
  </div>

  <section class="mt-10 max-w-md" aria-labelledby="password-title">
    <h2 id="password-title" class="text-lg font-semibold">Changer le mot de passe</h2>
    <form class="mt-4 grid gap-4" novalidate @submit.prevent="submit">
      <FormError :message="error" />
      <Alert v-if="done" role="status">
        <AlertDescription>
          Mot de passe modifié. Vos autres sessions ont été fermées.
        </AlertDescription>
      </Alert>
      <div class="grid gap-2">
        <Label for="current-password">Mot de passe actuel</Label>
        <Input
          id="current-password"
          v-model="current"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>
      <NewPasswordFields v-model:password="password" v-model:confirmation="confirmation" />
      <Button type="submit" class="justify-self-start" :disabled="pending">
        {{ pending ? 'Enregistrement…' : 'Changer le mot de passe' }}
      </Button>
    </form>
  </section>
</template>
