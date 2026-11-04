<script setup lang="ts">
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
</script>

<template>
  <h1 class="text-2xl font-semibold tracking-tight">Aucun espace</h1>
  <p v-if="session.me?.user.isSuperAdmin" class="mt-2 text-muted-foreground">
    Aucun espace n’a encore été créé.
  </p>
  <p v-else class="mt-2 text-muted-foreground">
    Vous n’avez accès à aucun espace pour l’instant. Demandez à votre administrateur de vous
    inviter.
  </p>
</template>
