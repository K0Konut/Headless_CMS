<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DangerSection from '@/components/settings/DangerSection.vue'
import GeneralSection from '@/components/settings/GeneralSection.vue'
import IgnoreSection from '@/components/settings/IgnoreSection.vue'
import IntegrationSection from '@/components/settings/IntegrationSection.vue'
import MembersSection from '@/components/settings/MembersSection.vue'
import FormError from '@/components/FormError.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { SpaceDetail } from '@/lib/spaces'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()

const slug = computed(() => String(route.params.espace))
const isSuperAdmin = computed(() => !!session.me?.user.isSuperAdmin)
const space = ref<SpaceDetail | null>(null)
const error = ref('')

watch(
  slug,
  async () => {
    error.value = ''
    // Un renommage de slug vient d'être fait ici : l'espace affiché est déjà à jour.
    if (space.value?.slug === slug.value) return
    try {
      space.value = await api<SpaceDetail>(`/spaces/${encodeURIComponent(slug.value)}`)
    } catch {
      error.value = 'Les réglages n’ont pas pu être chargés.'
    }
  },
  { immediate: true },
)
</script>

<template>
  <h1 class="text-2xl font-semibold tracking-tight">Réglages</h1>

  <FormError v-if="error" :message="error" class="mt-6 max-w-md" />
  <Skeleton v-else-if="!space" class="mt-8 h-64 max-w-md" />

  <!-- Un membre ne voit que « Ne pas me compter » (document UX). -->
  <div v-else class="mt-8 grid gap-10">
    <GeneralSection v-if="isSuperAdmin" :space="space" @updated="space = $event" />
    <MembersSection v-if="isSuperAdmin" :slug="space.slug" />
    <IntegrationSection v-if="isSuperAdmin" :space="space" />
    <IgnoreSection :site-url="space.siteUrl" />
    <DangerSection v-if="isSuperAdmin" :space="space" />
  </div>
</template>
