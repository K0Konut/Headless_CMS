export interface AnalyticsOptions {
  /** Clé publique de l'espace (Réglages › Intégration). */
  key: string
  /** URL de collecte, par exemple `https://cms.domaine/api/e`. */
  endpoint: string
}

// Forme validée côté serveur par `collectEventSchema` (packages/shared). Elle est recopiée ici
// plutôt qu'importée : Zod ferait dépasser le budget de 2 Ko.
type EventType = 'view' | 'cv'

const IGNORE = 'cms-ignore'

function isIgnored() {
  try {
    return localStorage.getItem(IGNORE) === '1'
  } catch {
    return false
  }
}

/** Lien magique `?cms-ignore=1` (ou `=0`) : pose ou retire le marqueur, nettoie l'URL et
 *  affiche une confirmation discrète. */
function handleIgnoreLink() {
  const url = new URL(location.href)
  const flag = url.searchParams.get(IGNORE)
  if (flag !== '1' && flag !== '0') return
  try {
    if (flag === '1') localStorage.setItem(IGNORE, '1')
    else localStorage.removeItem(IGNORE)
  } catch {
    return
  }
  url.searchParams.delete(IGNORE)
  history.replaceState(history.state, '', url)

  const toast = document.createElement('div')
  toast.setAttribute('role', 'status')
  toast.textContent =
    flag === '1'
      ? 'Vos visites ne sont plus comptées sur ce navigateur'
      : 'Vos visites sont de nouveau comptées sur ce navigateur'
  toast.style.cssText =
    'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'padding:8px 14px;border-radius:6px;background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif'
  // Script chargé dans <head> : body n'existe pas encore.
  ;(document.body ?? document.documentElement).append(toast)
  setTimeout(() => toast.remove(), 4000)
}

/** Domaine de provenance, seulement s'il est externe au site. */
function externalReferrer() {
  try {
    const host = new URL(document.referrer).hostname
    return host && host !== location.hostname ? host : undefined
  } catch {
    return undefined
  }
}

/**
 * Compte les vues (chargement et navigations SPA) et les clics sur les liens `data-cms-cv`.
 * Rien n'est envoyé hors navigateur (pré-rendu), en local, sous automatisation, ou si le
 * visiteur s'est exclu avec le lien magique. Renvoie une fonction qui arrête la collecte.
 */
let active = false

export function initAnalytics({ key, endpoint }: AnalyticsOptions) {
  // Hors navigateur (pré-rendu), ou déjà lancé (remontage, rechargement à chaud) : rien à faire.
  if (typeof window === 'undefined' || active) return () => {}
  active = true
  handleIgnoreLink()

  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  let referrer = externalReferrer()
  let lastPath = location.pathname

  const send = (t: EventType) => {
    if (local || navigator.webdriver || isIgnored()) return
    const event: Record<string, string> = { k: key, t, p: location.pathname.slice(0, 512) }
    // La provenance n'accompagne que la première vue de la visite.
    if (referrer) event.r = referrer
    referrer = undefined
    navigator.sendBeacon(endpoint, JSON.stringify(event))
  }

  const onNavigate = () => {
    if (location.pathname === lastPath) return
    lastPath = location.pathname
    send('view')
  }
  const onClick = (e: MouseEvent) => {
    // Clic gauche, ou clic molette (ouverture dans un nouvel onglet).
    if (e.button > 1) return
    if ((e.target as Element | null)?.closest?.('[data-cms-cv]')) send('cv')
  }

  // replaceState aussi : les redirections du routeur (/ → /fr) passent par lui. Les appels qui
  // gardent le même chemin (mémorisation du défilement) sont filtrés par onNavigate.
  const { pushState, replaceState } = history
  history.pushState = function (...args) {
    pushState.apply(this, args)
    onNavigate()
  }
  history.replaceState = function (...args) {
    replaceState.apply(this, args)
    onNavigate()
  }
  addEventListener('popstate', onNavigate)
  document.addEventListener('click', onClick)
  document.addEventListener('auxclick', onClick)
  send('view')

  return () => {
    history.pushState = pushState
    history.replaceState = replaceState
    removeEventListener('popstate', onNavigate)
    document.removeEventListener('click', onClick)
    document.removeEventListener('auxclick', onClick)
    active = false
  }
}
