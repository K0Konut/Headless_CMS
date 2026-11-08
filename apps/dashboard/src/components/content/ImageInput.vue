<script setup lang="ts">
import { IMAGE_MIME_TYPES, type ImageValue, imageWidths } from '@dashility/shared'
import { ImageUp } from '@lucide/vue'
import { computed, inject, ref } from 'vue'
import { READONLY_KEY } from '@/lib/content'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMedia } from '@/composables/useMedia'

/** Image (document UX, « Les types de champs ») : glisser-déposer ou « Parcourir », aperçu,
 *  textes alternatifs FR et EN, « Remplacer » et « Retirer ». Pas de médiathèque : l'image
 *  s'envoie directement dans son champ. */
const props = defineProps<{
  id: string
  label: string
  /** Erreur de publication : image manquante ou texte alternatif français vide. */
  error?: string
}>()
const value = defineModel<unknown>()

const image = computed(() => (value.value as ImageValue | null | undefined) ?? null)
const { media, loadError, uploading, uploadError, upload } = useMedia(
  computed(() => image.value?.id),
)
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const readonly = inject(READONLY_KEY, ref(false))

/** Aperçu : la plus petite variante WebP, servie par l'API (même origine, permise par la CSP). */
const preview = computed(() =>
  media.value?.kind === 'image' && media.value.width
    ? `/api/media/${media.value.id}/${imageWidths(media.value.width)[0]}.webp`
    : null,
)

async function send(file: File | undefined) {
  const created = await upload(file, {
    types: IMAGE_MIME_TYPES,
    error: 'Type de fichier non accepté : JPEG, PNG ou WebP.',
  })
  // Les textes alternatifs restent : ils se corrigent si la nouvelle image est différente.
  if (created) value.value = { id: created.id, alt: image.value?.alt ?? { fr: '', en: '' } }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  // Le fieldset désactive les boutons, pas le dépôt d'un fichier.
  if (!readonly.value) void send(event.dataTransfer?.files[0])
}

function setAlt(lang: 'fr' | 'en', text: string) {
  if (image.value) value.value = { ...image.value, alt: { ...image.value.alt, [lang]: text } }
}

const message = computed(() => uploadError.value || loadError.value || props.error || '')
const errorId = computed(() => `${props.id}-error`)
const altError = computed(() => !!props.error && !!image.value && !image.value.alt.fr.trim())
</script>

<template>
  <div class="grid gap-3">
    <input
      ref="fileInput"
      type="file"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      :accept="IMAGE_MIME_TYPES.join(',')"
      @change="
        (send(($event.target as HTMLInputElement).files?.[0]),
        (($event.target as HTMLInputElement).value = ''))
      "
    />

    <div
      v-if="!image"
      class="grid justify-items-start gap-2 rounded-md border border-dashed p-4 text-sm"
      :class="{ 'border-ring bg-accent': dragging, 'border-destructive': !!message }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <p class="text-muted-foreground">Glissez une image ici (JPEG, PNG ou WebP, 10 Mo au plus).</p>
      <Button
        :id="id"
        type="button"
        variant="outline"
        size="sm"
        :disabled="uploading"
        :aria-label="`Parcourir : ${label}`"
        :aria-describedby="message ? errorId : undefined"
        @click="fileInput?.click()"
      >
        <ImageUp aria-hidden="true" />{{ uploading ? 'Envoi…' : 'Parcourir' }}
      </Button>
    </div>

    <div v-else class="flex flex-wrap items-start gap-4">
      <div
        class="flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <img
          v-if="preview"
          :src="preview"
          :alt="image.alt.fr"
          class="size-full object-cover"
          :width="128"
          :height="128"
        />
        <span v-else class="text-xs text-muted-foreground">{{
          uploading ? 'Envoi…' : 'Aperçu'
        }}</span>
      </div>
      <div class="grid min-w-0 flex-1 gap-3">
        <div class="grid gap-1 sm:grid-cols-2 sm:gap-3">
          <div class="grid gap-1">
            <label :for="`${id}-alt-fr`" class="text-sm">Texte alternatif (français)</label>
            <Input
              :id="`${id}-alt-fr`"
              :model-value="image.alt.fr"
              maxlength="500"
              :aria-invalid="altError || undefined"
              :aria-describedby="altError ? errorId : undefined"
              @update:model-value="setAlt('fr', String($event))"
            />
          </div>
          <div class="grid gap-1">
            <label :for="`${id}-alt-en`" class="text-sm">Texte alternatif (anglais)</label>
            <Input
              :id="`${id}-alt-en`"
              lang="en"
              :model-value="image.alt.en"
              maxlength="500"
              @update:model-value="setAlt('en', String($event))"
            />
          </div>
        </div>
        <p class="text-sm text-muted-foreground">
          Décrivez ce que montre l’image pour qui ne la voit pas.
          <template v-if="media"
            >{{ media.originalName }}, {{ media.width }} × {{ media.height }} px.</template
          >
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            :id="id"
            type="button"
            variant="outline"
            size="sm"
            :disabled="uploading"
            :aria-label="`Remplacer : ${label}`"
            @click="fileInput?.click()"
          >
            {{ uploading ? 'Envoi…' : 'Remplacer' }}
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
        </div>
      </div>
    </div>

    <p v-if="message" :id="errorId" class="text-sm text-destructive">{{ message }}</p>
  </div>
</template>
