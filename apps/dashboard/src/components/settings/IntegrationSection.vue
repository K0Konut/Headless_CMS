<script setup lang="ts">
import { computed } from 'vue'
import CopyField from '@/components/CopyField.vue'
import type { SpaceDetail } from '@/lib/spaces'
import SettingsSection from './SettingsSection.vue'

const props = defineProps<{ space: SpaceDetail }>()

const snippet = computed(
  () => `import { initAnalytics } from '@cms/client'

initAnalytics({
  key: '${props.space.publicKey}',
  endpoint: '${location.origin}/api/e',
})`,
)
</script>

<template>
  <SettingsSection
    id="integration"
    title="Intégration"
    description="Installez le package @cms/client dans le site, puis appelez initAnalytics au démarrage."
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
      <p class="text-sm text-muted-foreground">
        Pour compter les téléchargements du CV, ajoutez l’attribut
        <code class="rounded bg-muted px-1">data-cms-cv</code> à son lien. Les visites ne sont
        comptées que si elles viennent de {{ space.siteUrl }}.
      </p>
    </div>
  </SettingsSection>
</template>
