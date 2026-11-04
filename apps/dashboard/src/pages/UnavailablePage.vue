<script setup lang="ts">
import { useRoute } from 'vue-router'
import AuthShell from '@/components/AuthShell.vue'
import { Button } from '@/components/ui/button'
import { safeReturn } from '@/lib/navigation'

const route = useRoute()

function retry() {
  // Rechargement complet : la session sera relue au démarrage.
  location.assign(safeReturn(route.query.retour) ?? '/')
}
</script>

<template>
  <AuthShell title="Serveur indisponible">
    <div class="grid gap-4 text-sm">
      <p>Le CMS ne répond pas pour l’instant. Vos données ne sont pas perdues.</p>
      <Button class="justify-self-start" @click="retry">Réessayer</Button>
    </div>
  </AuthShell>
</template>
