<script setup lang="ts">
/** Bloc de l'analytics : titre, note et action en en-tête, puis un tableau ou un graphique.
 *  Les cellules des tableaux s'alignent sur le titre, l'en-tête de tableau prend le fond gris. */
defineProps<{ title: string; titleId: string }>()
</script>

<template>
  <section
    :aria-labelledby="titleId"
    class="min-w-0 overflow-hidden rounded-lg border bg-card [&_thead]:bg-canvas [&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4"
  >
    <div class="flex min-h-12 flex-wrap items-center gap-x-2 border-b py-2 pr-2 pl-4">
      <h2 :id="titleId" class="font-semibold">{{ title }}</h2>
      <p v-if="$slots.note" class="text-sm text-muted-foreground"><slot name="note" /></p>
      <div v-if="$slots.action" class="ml-auto"><slot name="action" /></div>
    </div>
    <slot />
  </section>
</template>
