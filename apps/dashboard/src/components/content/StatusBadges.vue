<script setup lang="ts">
import type { EntryStatus } from '@dashility/shared'
import { Badge } from '@/components/ui/badge'
import { formatShortDateTime } from '@/lib/format'

/** Badges d'une entrée (document UX, « Statuts d'une entrée » et « Statut et badge » de la V3). */
defineProps<{ status: EntryStatus; enComplete: boolean; scheduledAt?: string | null }>()
</script>

<template>
  <span class="inline-flex flex-wrap gap-1">
    <Badge v-if="status === 'draft'" variant="secondary">Brouillon</Badge>
    <Badge v-else>Publié</Badge>
    <Badge v-if="status === 'modified'" variant="outline">Modifications non publiées</Badge>
    <Badge v-if="scheduledAt" variant="outline">
      Programmé le {{ formatShortDateTime(scheduledAt) }}
    </Badge>
    <Badge v-if="!enComplete" variant="outline">EN incomplet</Badge>
  </span>
</template>
