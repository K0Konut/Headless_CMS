<script setup lang="ts">
import { MAX_MEDIA_BYTES } from '@dashility/shared'
import { Download, FileUp } from '@lucide/vue'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useMedia } from '@/composables/useMedia'
import { formatBytes, formatDate } from '@/lib/format'

/** Fichier PDF (document UX, « Les types de champs ») : « Parcourir », nom, taille et date,
 *  « Remplacer » après confirmation (pas d'historique) et « Télécharger ». */
const props = defineProps<{ id: string; label: string; error?: string }>()
const value = defineModel<unknown>()

const fileId = computed(() => (typeof value.value === 'string' ? value.value : null))
const { media, loadError, uploading, uploadError, upload } = useMedia(fileId)
const fileInput = ref<HTMLInputElement | null>(null)
const localError = ref('')

function choose() {
  if (
    fileId.value &&
    !window.confirm(
      'Remplacer ce fichier ? L’ancien ne sera plus proposé : il n’y a pas d’historique.',
    )
  ) {
    return
  }
  fileInput.value?.click()
}

async function send(file: File | undefined) {
  localError.value = ''
  if (!file) return
  if (file.type !== 'application/pdf') {
    localError.value = 'Seuls les fichiers PDF sont acceptés.'
    return
  }
  if (file.size > MAX_MEDIA_BYTES) {
    localError.value = 'Fichier trop volumineux : 10 Mo au plus.'
    return
  }
  const created = await upload(file)
  if (created) value.value = created.id
}

const message = computed(
  () => localError.value || uploadError.value || loadError.value || props.error || '',
)
const errorId = computed(() => `${props.id}-error`)
</script>

<template>
  <div class="grid gap-2">
    <input
      ref="fileInput"
      type="file"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      accept="application/pdf"
      @change="
        (send(($event.target as HTMLInputElement).files?.[0]),
        (($event.target as HTMLInputElement).value = ''))
      "
    />
    <p v-if="media" class="text-sm">
      <span class="font-medium break-all">{{ media.originalName }}</span>
      <span class="text-muted-foreground">
        · {{ formatBytes(media.bytes) }} · envoyé le {{ formatDate(media.createdAt) }}</span
      >
    </p>
    <div class="flex flex-wrap gap-2">
      <Button
        :id="id"
        type="button"
        variant="outline"
        size="sm"
        :disabled="uploading"
        :aria-label="`${fileId ? 'Remplacer' : 'Parcourir'} : ${label}`"
        :aria-invalid="!!message || undefined"
        :aria-describedby="message ? errorId : undefined"
        @click="choose"
      >
        <FileUp aria-hidden="true" />{{ uploading ? 'Envoi…' : fileId ? 'Remplacer' : 'Parcourir' }}
      </Button>
      <template v-if="fileId">
        <Button variant="ghost" size="sm" as-child>
          <a
            :href="`/api/media/${fileId}/original.pdf`"
            :download="media?.originalName ?? true"
            :aria-label="`Télécharger : ${label}`"
          >
            <Download aria-hidden="true" />Télécharger
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :disabled="uploading"
          :aria-label="`Retirer : ${label}`"
          @click="value = null"
        >
          Retirer
        </Button>
      </template>
    </div>
    <p v-if="!fileId" class="text-sm text-muted-foreground">Un fichier PDF, 10 Mo au plus.</p>
    <p v-if="message" :id="errorId" class="text-sm text-destructive">{{ message }}</p>
  </div>
</template>
