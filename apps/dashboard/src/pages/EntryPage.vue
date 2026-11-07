<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EntryEditor from '@/components/content/EntryEditor.vue'
import FormError from '@/components/FormError.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import type { ContentType } from '@/lib/content'

/** Une entrée d'une collection. */
const route = useRoute()
const space = computed(() => String(route.params.espace))
const typeSlug = computed(() => String(route.params.type))

const type = ref<ContentType | null>(null)
const error = ref('')
watch(
  [space, typeSlug],
  async () => {
    type.value = null
    error.value = ''
    try {
      type.value = await api<ContentType>(
        `/spaces/${encodeURIComponent(space.value)}/types/${encodeURIComponent(typeSlug.value)}`,
      )
    } catch (err) {
      error.value = errorMessage(err)
    }
  },
  { immediate: true },
)
</script>

<template>
  <FormError v-if="error" :message="error" class="max-w-md" />
  <Skeleton v-else-if="!type" class="h-64" />
  <EntryEditor v-else :space="space" :type="type" :entry-id="String(route.params.entree)" />
</template>
