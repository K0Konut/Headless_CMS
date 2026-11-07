import type { Media } from '@dashility/shared'
import { type Ref, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, errorMessage, uploadFile } from '@/lib/api'

/** Description d'un média cité par une valeur, et son envoi. Les médias appartiennent à
 *  l'espace de l'URL. */
export function useMedia(id: Ref<string | null | undefined>) {
  const route = useRoute()
  const base = `/spaces/${encodeURIComponent(String(route.params.espace))}/media`
  const media = ref<Media | null>(null)
  const loadError = ref('')
  const uploading = ref(false)
  const uploadError = ref('')

  let latest = 0
  watch(
    id,
    async (value) => {
      const request = ++latest
      loadError.value = ''
      if (!value) {
        media.value = null
        return
      }
      // Le média qu'on vient d'envoyer est déjà décrit : pas besoin de le relire.
      if (media.value?.id === value) return
      media.value = null
      try {
        const loaded = await api<Media>(`${base}/${value}`)
        if (request === latest) media.value = loaded
      } catch (err) {
        if (request === latest) loadError.value = errorMessage(err)
      }
    },
    { immediate: true },
  )

  /** Envoie un fichier ; renvoie sa description, ou null après un échec (message dans
   *  `uploadError`). */
  async function upload(file: File) {
    uploading.value = true
    uploadError.value = ''
    try {
      const created = await uploadFile<Media>(base, file)
      media.value = created
      return created
    } catch (err) {
      uploadError.value = errorMessage(err)
      return null
    } finally {
      uploading.value = false
    }
  }

  return { media, loadError, uploading, uploadError, upload }
}
