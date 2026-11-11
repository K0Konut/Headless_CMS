<script setup lang="ts">
import type { EntryStatus } from '@dashility/shared'
import StatusPill from '@/components/StatusPill.vue'
import { formatShortDateTime } from '@/lib/format'

/** Badges d'une entrée (document UX, « Statuts d'une entrée » et « Statut et badge » de la V3).
 *  `todo` : seulement ce qui demande une action (« À traiter » de l'écran Contenu). */
defineProps<{
  status: EntryStatus
  enComplete: boolean
  scheduledAt?: string | null
  todo?: boolean
}>()
</script>

<template>
  <span class="inline-flex flex-wrap gap-1">
    <StatusPill v-if="status === 'draft'" tone="draft">Brouillon</StatusPill>
    <StatusPill v-else-if="!todo" tone="published">Publié</StatusPill>
    <StatusPill v-if="status === 'modified'" tone="modified">Modifications non publiées</StatusPill>
    <StatusPill v-if="scheduledAt" tone="scheduled">
      Programmé le {{ formatShortDateTime(scheduledAt) }}
    </StatusPill>
    <StatusPill v-if="!enComplete" tone="en">EN incomplet</StatusPill>
  </span>
</template>
