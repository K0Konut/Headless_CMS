import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, errorMessage } from '@/lib/api'
import type { ContentType } from '@/lib/content'

/** Types de l'espace ouvert, avec leurs compteurs : la barre latérale les liste sous « Contenu »
 *  et l'écran Contenu les affiche. Relus à chaque navigation, pour suivre Structure et les
 *  publications. */
export const useContentStore = defineStore('content', () => {
  const space = ref<string | null>(null)
  const types = ref<ContentType[] | null>(null)
  const error = ref('')
  // Changement d'espace pendant un chargement : seule la dernière réponse compte.
  let latest = 0

  async function load(slug: string) {
    const request = ++latest
    if (space.value !== slug) [types.value, error.value] = [null, '']
    space.value = slug
    try {
      const loaded = await api<ContentType[]>(`/spaces/${encodeURIComponent(slug)}/types`)
      if (request === latest) [types.value, error.value] = [loaded, '']
    } catch (err) {
      if (request === latest) error.value = errorMessage(err)
    }
  }

  return { space, types, error, load }
})
