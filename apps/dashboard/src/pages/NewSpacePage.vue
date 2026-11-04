<script setup lang="ts">
import { createSpaceSchema } from '@dashility/shared'
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FormError from '@/components/FormError.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { slugify } from '@/lib/slug'
import type { SpaceDetail } from '@/lib/spaces'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()

const form = reactive({ name: '', slug: '', siteUrl: '' })
const error = ref('')
const pending = ref(false)

/** Le slug suit le nom tant qu'il n'a pas été modifié à la main. */
const slugEdited = ref(false)
watch(
  () => form.name,
  (name) => {
    if (!slugEdited.value) form.slug = slugify(name)
  },
)

async function submit() {
  const parsed = createSpaceSchema.safeParse(form)
  error.value = parsed.success ? '' : (parsed.error.issues[0]?.message ?? 'Champs invalides')
  if (!parsed.success) return
  pending.value = true
  try {
    const space = await api<SpaceDetail>('/spaces', { method: 'POST', body: parsed.data })
    await session.load()
    // Étape suivante du parcours : installer le script.
    await router.push(`/espaces/${space.slug}/reglages#integration`)
  } catch (err) {
    error.value = errorMessage(err)
    pending.value = false
  }
}
</script>

<template>
  <h1 class="text-2xl font-semibold tracking-tight">Nouvel espace</h1>
  <p class="mt-2 max-w-prose text-muted-foreground">
    Un espace correspond à un site. Vous y installerez ensuite le script de collecte.
  </p>

  <form class="mt-8 grid max-w-md gap-4" novalidate @submit.prevent="submit">
    <FormError :message="error" />
    <div class="grid gap-2">
      <Label for="new-name">Nom</Label>
      <Input id="new-name" v-model="form.name" required />
    </div>
    <div class="grid gap-2">
      <Label for="new-slug">Slug</Label>
      <Input
        id="new-slug"
        v-model="form.slug"
        aria-describedby="new-slug-hint"
        required
        @input="slugEdited = true"
      />
      <p id="new-slug-hint" class="text-sm text-muted-foreground">
        Utilisé dans les adresses du dashboard : minuscules, chiffres et tirets.
      </p>
    </div>
    <div class="grid gap-2">
      <Label for="new-site">URL du site</Label>
      <Input id="new-site" v-model="form.siteUrl" type="url" required />
    </div>
    <Button type="submit" class="justify-self-start" :disabled="pending">
      {{ pending ? 'Création…' : 'Créer l’espace' }}
    </Button>
  </form>
</template>
