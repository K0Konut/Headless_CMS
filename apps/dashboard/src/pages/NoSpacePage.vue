<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
</script>

<template>
  <h1 class="text-2xl font-semibold tracking-tight">Aucun espace</h1>
  <template v-if="session.me?.user.isSuperAdmin">
    <p class="mt-2 text-muted-foreground">
      Créez un espace pour chaque site dont vous voulez suivre les visites.
    </p>
    <Button as-child class="mt-6">
      <RouterLink to="/espaces/nouveau">Créer un espace</RouterLink>
    </Button>
  </template>
  <p v-else class="mt-2 text-muted-foreground">
    Vous n’avez accès à aucun espace pour l’instant. Demandez à votre administrateur de vous
    inviter.
  </p>
</template>
