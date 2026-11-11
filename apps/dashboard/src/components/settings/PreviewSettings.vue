<script setup lang="ts">
import { previewLink, previewUrlSchema } from '@dashility/shared'
import { ExternalLink } from '@lucide/vue'
import { ref, watch } from 'vue'
import FormError from '@/components/FormError.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import type { SpaceDetail } from '@/lib/spaces'
import { useSessionStore } from '@/stores/session'

/** URL d'aperçu (document UX, « Réglages › Intégration (ajout V3) ») : la page du site qui
 *  affiche un brouillon. Facultative : sans elle, « Prévisualiser » n'apparaît pas. */
const props = defineProps<{ space: SpaceDetail }>()
const emit = defineEmits<{ updated: [SpaceDetail] }>()
const session = useSessionStore()

const url = ref('')
watch(
  () => props.space.previewUrl,
  (saved) => (url.value = saved ?? ''),
  { immediate: true },
)
const error = ref('')
const saved = ref(false)
const pending = ref(false)

async function save() {
  saved.value = false
  const value = url.value.trim()
  const parsed = previewUrlSchema.nullable().safeParse(value || null)
  error.value = parsed.success ? '' : (parsed.error.issues[0]?.message ?? 'URL invalide')
  if (!parsed.success) return
  pending.value = true
  try {
    const updated = await api<SpaceDetail>(`/spaces/${encodeURIComponent(props.space.slug)}`, {
      method: 'PATCH',
      body: { previewUrl: parsed.data },
    })
    emit('updated', updated)
    saved.value = true
    // L'éditeur lit l'URL d'aperçu dans la session pour afficher « Prévisualiser ». Un échec ici
    // ne change rien à l'enregistrement : la session sera relue à la prochaine navigation.
    await session.load().catch(() => {})
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="grid grid-cols-1 gap-3">
    <p class="text-sm font-medium">Prévisualisation</p>
    <p class="text-sm text-muted-foreground">
      La page d’aperçu du site : elle reçoit
      <code class="rounded bg-muted px-1">?dashility-preview=…</code>, lit l’entrée avec
      <code class="rounded bg-muted px-1">GET /api/preview/&lt;jeton&gt;?locale=fr</code> et
      l’affiche avec les composants du site. Laissez vide si le site n’en a pas.
    </p>
    <FormError :message="error" />
    <Alert v-if="saved" role="status">
      <AlertDescription>URL d’aperçu enregistrée.</AlertDescription>
    </Alert>
    <form class="grid max-w-xl gap-3" novalidate @submit.prevent="save">
      <div class="grid gap-1.5">
        <Label for="preview-url">URL d’aperçu</Label>
        <Input
          id="preview-url"
          v-model="url"
          type="url"
          inputmode="url"
          placeholder="https://www.exemple.fr/apercu"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <Button type="submit" :disabled="pending">Enregistrer</Button>
        <!-- Un jeton d'essai : la page doit répondre « lien expiré », preuve qu'elle interroge
             Dashility. -->
        <Button v-if="space.previewUrl" variant="outline" as-child>
          <a :href="previewLink(space.previewUrl, 'essai')" target="_blank" rel="noopener">
            <ExternalLink aria-hidden="true" />Tester<span class="sr-only"> (nouvel onglet)</span>
          </a>
        </Button>
      </div>
      <p v-if="space.previewUrl" class="text-sm text-muted-foreground">
        « Tester » ouvre la page avec un lien d’essai : elle doit afficher que le lien a expiré.
      </p>
    </form>
  </div>
</template>
