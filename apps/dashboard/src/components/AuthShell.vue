<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

defineProps<{ title: string; description?: string }>()
</script>

<template>
  <main id="contenu" class="grid min-h-svh place-items-center bg-muted/40 px-4 py-12">
    <div class="w-full max-w-sm">
      <p class="mb-6 text-center text-sm font-semibold tracking-tight text-muted-foreground">
        Dashility
      </p>
      <Card>
        <CardHeader>
          <!-- h1 : CardTitle impose un h3, faux en titre de page. -->
          <h1 class="text-xl leading-none font-semibold">{{ title }}</h1>
          <CardDescription v-if="description">{{ description }}</CardDescription>
        </CardHeader>
        <CardContent>
          <slot />
        </CardContent>
      </Card>
    </div>
  </main>
</template>
