<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmDelete from '@/components/ConfirmDelete.vue'
import { api, errorMessage } from '@/lib/api'
import type { SpaceDetail } from '@/lib/spaces'
import { useSessionStore } from '@/stores/session'
import SettingsSection from './SettingsSection.vue'

const props = defineProps<{ space: SpaceDetail }>()

const session = useSessionStore()
const router = useRouter()
const error = ref('')
const pending = ref(false)

async function remove() {
  pending.value = true
  try {
    await api(`/spaces/${encodeURIComponent(props.space.slug)}`, { method: 'DELETE' })
    await session.load()
    await router.replace('/')
  } catch (err) {
    error.value = errorMessage(err)
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
    <ConfirmDelete
      id="delete-confirmation"
      :name="space.name"
      action="Supprimer l’espace"
      :error="error"
      :pending="pending"
      @confirm="remove"
    />
  </SettingsSection>
</template>
