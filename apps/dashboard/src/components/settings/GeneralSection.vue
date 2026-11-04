<script setup lang="ts">
import { createSpaceSchema } from '@dashility/shared'
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FormError from '@/components/FormError.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import type { SpaceDetail } from '@/lib/spaces'
import { useSessionStore } from '@/stores/session'
import SettingsSection from './SettingsSection.vue'

const props = defineProps<{ space: SpaceDetail }>()
const emit = defineEmits<{ updated: [SpaceDetail] }>()

const session = useSessionStore()
const router = useRouter()
const form = reactive({ name: '', slug: '', siteUrl: '' })
// Le formulaire suit l'espace affiché (changement d'espace, enregistrement).
watch(
  () => props.space,
  ({ name, slug, siteUrl }) => Object.assign(form, { name, slug, siteUrl }),
  { immediate: true },
)
const error = ref('')
const done = ref(false)
const pending = ref(false)

async function submit() {
  done.value = false
  const parsed = createSpaceSchema.safeParse(form)
  error.value = parsed.success ? '' : (parsed.error.issues[0]?.message ?? 'Champs invalides')
  if (!parsed.success) return
  pending.value = true
  const previousSlug = props.space.slug
  try {
    const updated = await api<SpaceDetail>(`/spaces/${encodeURIComponent(previousSlug)}`, {
      method: 'PATCH',
      body: parsed.data,
    })
    // Avant le changement d'URL : la page sait alors que l'espace affiché est déjà à jour.
    emit('updated', updated)
    // Nom et slug apparaissent dans la barre latérale : la session doit être relue. Après un
    // renommage, le garde du routeur le fait en voyant le nouveau slug. Relire la session avant
    // de changer d'URL rendrait l'ancien slug introuvable, et la page serait démontée.
    if (updated.slug !== previousSlug) {
      await router.replace(`/espaces/${updated.slug}/reglages`)
    } else {
      await session.load()
    }
    done.value = true
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <SettingsSection id="general" title="Général">
    <form class="grid max-w-md gap-4" novalidate @submit.prevent="submit">
      <FormError :message="error" />
      <Alert v-if="done" role="status">
        <AlertDescription>Modifications enregistrées.</AlertDescription>
      </Alert>
      <div class="grid gap-2">
        <Label for="space-name">Nom</Label>
        <Input id="space-name" v-model="form.name" required />
      </div>
      <div class="grid gap-2">
        <Label for="space-slug">Slug</Label>
        <Input id="space-slug" v-model="form.slug" aria-describedby="space-slug-hint" required />
        <p id="space-slug-hint" class="text-sm text-muted-foreground">
          Utilisé dans les adresses du dashboard. Le changer casse les liens déjà partagés.
        </p>
      </div>
      <div class="grid gap-2">
        <Label for="space-site">URL du site</Label>
        <Input
          id="space-site"
          v-model="form.siteUrl"
          type="url"
          aria-describedby="space-site-hint"
          required
        />
        <p id="space-site-hint" class="text-sm text-muted-foreground">
          Seules les visites venant de cette adresse sont comptées.
        </p>
      </div>
      <Button type="submit" class="justify-self-start" :disabled="pending">
        {{ pending ? 'Enregistrement…' : 'Enregistrer' }}
      </Button>
    </form>
  </SettingsSection>
</template>
