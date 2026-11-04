<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import SettingsSection from './SettingsSection.vue'

const props = defineProps<{ siteUrl: string }>()
const url = (flag: 0 | 1) => `${props.siteUrl}/?dashility-ignore=${flag}`
</script>

<template>
  <SettingsSection
    id="ne-pas-me-compter"
    title="Ne pas me compter"
    description="Le site s’ouvre dans un nouvel onglet et retient ce choix pour ce navigateur. À refaire sur chaque navigateur que vous utilisez."
  >
    <div class="flex flex-wrap gap-2">
      <Button as-child>
        <a :href="url(1)" target="_blank" rel="noopener">
          Ouvrir le site et m’exclure <ExternalLink aria-hidden="true" />
          <span class="sr-only">(nouvel onglet)</span>
        </a>
      </Button>
      <Button as-child variant="outline">
        <a :href="url(0)" target="_blank" rel="noopener">
          Ouvrir le site et me compter à nouveau <ExternalLink aria-hidden="true" />
          <span class="sr-only">(nouvel onglet)</span>
        </a>
      </Button>
    </div>
  </SettingsSection>
</template>
