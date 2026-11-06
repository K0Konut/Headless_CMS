<script setup lang="ts">
import { ref } from 'vue'
import FormError from '@/components/FormError.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Suppression définitive, confirmée en retapant le nom de ce qu'on supprime (document UX). */
defineProps<{ id: string; name: string; action: string; error: string; pending: boolean }>()
defineEmits<{ confirm: [] }>()

const confirmation = ref('')
</script>

<template>
  <form class="grid max-w-md gap-4" @submit.prevent="$emit('confirm')">
    <FormError :message="error" />
    <div class="grid gap-2">
      <Label :for="id">Pour confirmer, tapez « {{ name }} »</Label>
      <Input :id="id" v-model="confirmation" autocomplete="off" />
    </div>
    <Button
      type="submit"
      variant="destructive"
      class="justify-self-start"
      :disabled="confirmation !== name || pending"
    >
      {{ action }}
    </Button>
  </form>
</template>
