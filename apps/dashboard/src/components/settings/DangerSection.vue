<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import FormError from '@/components/FormError.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, api } from '@/lib/api'
import type { SpaceDetail } from '@/lib/spaces'
import { useSessionStore } from '@/stores/session'
import SettingsSection from './SettingsSection.vue'

const props = defineProps<{ space: SpaceDetail }>()

const session = useSessionStore()
const router = useRouter()
const confirmation = ref('')
const error = ref('')
const pending = ref(false)

async function remove() {
  pending.value = true
  try {
    await api(`/spaces/${encodeURIComponent(props.space.slug)}`, { method: 'DELETE' })
    await session.load()
    await router.replace('/')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Une erreur est survenue'
    pending.value = false
  }
}
</script>

<template>
  <SettingsSection
    id="suppression"
    title="Supprimer l’espace"
    description="Les statistiques, les membres et les invitations de l’espace sont supprimés définitivement. Les membres qui n’appartiennent à aucun autre espace perdent l’accès."
  >
    <form class="grid max-w-md gap-4" @submit.prevent="remove">
      <FormError :message="error" />
      <div class="grid gap-2">
        <Label for="delete-confirmation">Pour confirmer, tapez « {{ space.name }} »</Label>
        <Input id="delete-confirmation" v-model="confirmation" autocomplete="off" />
      </div>
      <Button
        type="submit"
        variant="destructive"
        class="justify-self-start"
        :disabled="confirmation !== space.name || pending"
      >
        Supprimer l’espace
      </Button>
    </form>
  </SettingsSection>
</template>
