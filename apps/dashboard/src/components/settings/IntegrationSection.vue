<script setup lang="ts">
import { computed } from 'vue'
import CopyField from '@/components/CopyField.vue'
import type { SpaceDetail } from '@/lib/spaces'
import ApiKeyField from './ApiKeyField.vue'
import DeploySettings from './DeploySettings.vue'
import SettingsSection from './SettingsSection.vue'

const props = defineProps<{ space: SpaceDetail }>()

const snippet = computed(
  () => `import { initAnalytics } from '@dashility/client'

initAnalytics({
  key: '${props.space.publicKey}',
  endpoint: '${location.origin}/api/e',
})`,
)

/** Lecture du contenu au build du site, la clé étant dans un secret. */
const readSnippet = `const res = await fetch('${location.origin}/api/v1/content/projets?locale=fr', {
  headers: { Authorization: \`Bearer \${process.env.DASHILITY_API_KEY}\` },
})
const projets = await res.json()`
</script>

<template>
  <SettingsSection
    id="integration"
    title="Intégration"
    description="Installez le package @dashility/client dans le site, puis appelez initAnalytics au démarrage."
  >
    <div class="grid max-w-2xl grid-cols-1 gap-4">
      <div class="grid grid-cols-1 gap-2">
        <p class="text-sm font-medium">Identifiant public de l’espace</p>
        <CopyField :value="space.publicKey!" label="Identifiant public" />
      </div>
      <div class="grid grid-cols-1 gap-2">
        <p class="text-sm font-medium">Extrait d’installation</p>
        <CopyField :value="snippet" label="Extrait d’installation" multiline />
      </div>
      <ApiKeyField :slug="space.slug" :created-at="space.apiKeyCreatedAt ?? null" />
      <DeploySettings :slug="space.slug" />
      <div class="grid grid-cols-1 gap-2">
        <p class="text-sm font-medium">Lire le contenu publié</p>
        <CopyField :value="readSnippet" label="Exemple de lecture du contenu" multiline />
        <p class="text-sm text-muted-foreground">
          Remplacez <code class="rounded bg-muted px-1">projets</code> par l’identifiant d’un type.
          Toutes les routes et le format des valeurs :
          <a href="/api/docs" class="underline underline-offset-4">documentation de l’API</a>.
        </p>
      </div>
      <p class="text-sm text-muted-foreground">
        Pour compter les téléchargements du CV, ajoutez l’attribut
        <code class="rounded bg-muted px-1">data-dashility-cv</code> à son lien. Les visites ne sont
        comptées que si elles viennent de {{ space.siteUrl }}.
      </p>
    </div>
  </SettingsSection>
</template>
