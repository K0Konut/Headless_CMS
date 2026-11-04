<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
</script>

<template>
  <h1 class="text-2xl font-semibold tracking-tight">Page introuvable</h1>
  <p class="mt-2 text-muted-foreground">Cette page n’existe pas, ou vous n’y avez pas accès.</p>
  <Button as-child variant="outline" class="mt-6">
    <RouterLink to="/">Revenir à l’accueil</RouterLink>
  </Button>
</template>
