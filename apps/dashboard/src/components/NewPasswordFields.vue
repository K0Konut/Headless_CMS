<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const password = defineModel<string>('password', { required: true })
const confirmation = defineModel<string>('confirmation', { required: true })
</script>

<template>
  <div class="grid gap-2">
    <Label for="new-password">Nouveau mot de passe</Label>
    <Input
      id="new-password"
      v-model="password"
      type="password"
      autocomplete="new-password"
      aria-describedby="new-password-hint"
      required
    />
    <p id="new-password-hint" class="text-sm text-muted-foreground">12 caractères au moins.</p>
  </div>
  <div class="grid gap-2">
    <Label for="confirmation">Confirmer</Label>
    <Input
      id="confirmation"
      v-model="confirmation"
      type="password"
      autocomplete="new-password"
      required
    />
  </div>
</template>
