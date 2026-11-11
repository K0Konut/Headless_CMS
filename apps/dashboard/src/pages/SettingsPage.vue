<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
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

let latest = 0
watch(
  slug,
  async () => {
    error.value = ''
    // Un renommage de slug vient d'être fait ici : l'espace affiché est déjà à jour.
    if (space.value?.slug === slug.value) return
    // Autre espace : on n'affiche pas l'ancien pendant le chargement, et seule la dernière
    // réponse compte.
    const request = ++latest
    space.value = null
    try {
      const loaded = await api<SpaceDetail>(`/spaces/${encodeURIComponent(slug.value)}`)
      if (request !== latest) return
      space.value = loaded
      // Ancre (#integration après une création) : la section n'existe qu'une fois chargée.
      await nextTick()
      if (route.hash) document.querySelector(route.hash)?.scrollIntoView()
    } catch {
      if (request === latest) error.value = 'Les réglages n’ont pas pu être chargés.'
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
  <!-- Clé : la date de création, qui identifie l'espace sans changer au renommage. Changer
       d'espace recrée les sections (membres, confirmation) ; renommer les garde. -->
  <div v-else :key="space.createdAt" class="mt-8 grid gap-6">
    <GeneralSection v-if="isSuperAdmin" :space="space" @updated="space = $event" />
    <MembersSection v-if="isSuperAdmin" :slug="space.slug" />
    <IntegrationSection v-if="isSuperAdmin" :space="space" @updated="space = $event" />
    <IgnoreSection :site-url="space.siteUrl" />
    <DangerSection v-if="isSuperAdmin" :space="space" />
  </div>
</template>
