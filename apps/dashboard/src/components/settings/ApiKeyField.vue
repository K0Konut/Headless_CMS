<script setup lang="ts">
import { KeyRound } from '@lucide/vue'
import { ref } from 'vue'
import CopyField from '@/components/CopyField.vue'
import FormError from '@/components/FormError.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'

/** Clé de l'API de lecture (document UX, « Réglages › Intégration ») : affichée une seule fois,
 *  juste après sa génération ; ensuite, seule sa date de création apparaît. */
const props = defineProps<{ slug: string; createdAt: string | null }>()

const created = ref(props.createdAt)
const key = ref('')
const pending = ref(false)
const error = ref('')

async function generate() {
  if (
    created.value &&
    !window.confirm(
      'Régénérer la clé ? L’ancienne cesse aussitôt de fonctionner : le site devra utiliser la nouvelle.',
    )
  ) {
    return
  }
  pending.value = true
  error.value = ''
  try {
    const res = await api<{ key: string; createdAt: string }>(
      `/spaces/${encodeURIComponent(props.slug)}/api-key`,
      { method: 'POST' },
    )
    key.value = res.key
    created.value = res.createdAt
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="grid grid-cols-1 gap-2">
    <p class="text-sm font-medium">Clé API de lecture</p>
    <FormError :message="error" />
    <template v-if="key">
      <CopyField :value="key" label="Clé API" />
      <Alert role="status">
        <AlertDescription>
          Copiez-la maintenant : elle ne sera plus affichée. Gardez-la côté serveur (secret du build
          du site), jamais dans le code envoyé aux navigateurs.
        </AlertDescription>
      </Alert>
    </template>
    <p v-else class="text-sm text-muted-foreground">
      {{
        created
          ? `Clé créée le ${formatDate(created)}.`
          : 'Aucune clé : le site ne peut pas encore lire le contenu.'
      }}
    </p>
    <Button
      type="button"
      variant="outline"
      class="justify-self-start"
      :disabled="pending"
      @click="generate"
    >
      <KeyRound aria-hidden="true" />{{ created ? 'Régénérer la clé' : 'Générer une clé' }}
    </Button>
  </div>
</template>
