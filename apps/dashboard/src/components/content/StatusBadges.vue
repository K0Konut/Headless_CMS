<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import type { EntryStatus } from '@dashility/shared'

/** Badges d'une entrée (document UX, « Statuts d'une entrée »). */
defineProps<{ status: EntryStatus; enComplete: boolean }>()
</script>

<template>
  <span class="inline-flex flex-wrap gap-1">
    <Badge v-if="status === 'draft'" variant="secondary">Brouillon</Badge>
    <Badge v-else>Publié</Badge>
    <Badge v-if="status === 'modified'" variant="outline">Modifications non publiées</Badge>
    <Badge v-if="!enComplete" variant="outline">EN incomplet</Badge>
  </span>
</template>
