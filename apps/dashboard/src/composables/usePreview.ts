import { type Ref, ref } from 'vue'
import { api, errorMessage } from '@/lib/api'
import { formatLongDateTime } from '@/lib/format'

/** Prévisualisation d'une entrée (document UX, « V3 : prévisualisation ») : chaque appel crée un
 *  lien valable 24 h. `beforeOpen` enregistre la saisie, pour que l'aperçu la montre. */
export function usePreview(entryPath: Ref<string>, beforeOpen: () => Promise<unknown>) {
  const error = ref('')
  const message = ref('')
  /** Lien que le navigateur n'a pas pu copier ou ouvrir : affiché pour être copié à la main. */
  const fallback = ref('')

  async function create() {
    error.value = ''
    message.value = ''
    fallback.value = ''
    await beforeOpen()
    try {
      return await api<{ url: string; expiresAt: string }>(`${entryPath.value}/preview`, {
        method: 'POST',
      })
    } catch (err) {
      error.value = errorMessage(err)
      return null
    }
  }

  async function open() {
    // L'onglet s'ouvre pendant le clic : après un await, le navigateur bloquerait la fenêtre.
    const tab = window.open('', '_blank')
    // Le site ne doit pas pouvoir rediriger l'onglet du dashboard.
    if (tab) tab.opener = null
    const link = await create()
    if (!link) return tab?.close()
    if (tab) return void (tab.location.href = link.url)
    fallback.value = link.url
    message.value = 'Le navigateur a bloqué le nouvel onglet : ouvrez ou copiez ce lien.'
  }

  async function copy() {
    const link = await create()
    if (!link) return
    const until = `valable jusqu’au ${formatLongDateTime(link.expiresAt)}`
    try {
      // Refusé si le geste de l'utilisateur est trop ancien (enregistrement lent) ou hors https.
      await navigator.clipboard.writeText(link.url)
      message.value = `Lien d’aperçu copié, ${until}.`
    } catch {
      fallback.value = link.url
      message.value = `Lien d’aperçu ${until}.`
    }
  }

  return { open, copy, error, message, fallback }
}
