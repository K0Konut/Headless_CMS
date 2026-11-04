<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'
import { Alert, AlertDescription } from '@/components/ui/alert'

defineProps<{ message: string }>()
</script>

<template>
  <Alert v-if="message" variant="destructive" role="alert">
    <CircleAlert aria-hidden="true" />
    <AlertDescription>{{ message }}</AlertDescription>
  </Alert>
</template>
