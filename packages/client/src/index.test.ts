import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initAnalytics } from './index'

const OPTIONS = { key: 'pk_test', endpoint: 'https://dashility.exemple.fr/api/e' }
const beacon = vi.fn<(url: string, body: string) => boolean>(() => true)
let stop: () => void

/** Événements envoyés, décodés. */
const sent = () => beacon.mock.calls.map(([, body]) => JSON.parse(body))

function setReferrer(value: string) {
  Object.defineProperty(document, 'referrer', { value, configurable: true })
}

beforeEach(() => {
  beacon.mockClear()
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  localStorage.clear()
  history.replaceState(null, '', '/')
  setReferrer('')
})
afterEach(() => stop?.())

describe('initAnalytics', () => {
  it('envoie une vue au chargement, avec la provenance externe', () => {
    history.replaceState(null, '', '/projets/cms?utm=x#haut')
    setReferrer('https://www.linkedin.com/feed/')
    stop = initAnalytics(OPTIONS)

    expect(beacon).toHaveBeenCalledWith(OPTIONS.endpoint, expect.any(String))
    expect(sent()).toEqual([{ k: 'pk_test', t: 'view', p: '/projets/cms', r: 'www.linkedin.com' }])
  })

  it('n’envoie pas une provenance interne au site', () => {
    setReferrer('https://exemple.fr/autre-page')
    stop = initAnalytics(OPTIONS)
    expect(sent()[0].r).toBeUndefined()
  })

  it('compte les navigations SPA, sans répéter la provenance', () => {
    setReferrer('https://github.com/')
    stop = initAnalytics(OPTIONS)
    history.pushState(null, '', '/projets')
    history.pushState(null, '', '/projets?filtre=vue') // même page : pas de nouvelle vue
    history.pushState(null, '', '/contact')

    expect(sent()).toEqual([
      { k: 'pk_test', t: 'view', p: '/', r: 'github.com' },
      { k: 'pk_test', t: 'view', p: '/projets' },
      { k: 'pk_test', t: 'view', p: '/contact' },
    ])
  })

  it('compte une redirection du routeur (replaceState)', () => {
    stop = initAnalytics(OPTIONS)
    history.replaceState(null, '', '/fr')
    history.replaceState({ scroll: 120 }, '', '/fr') // mémorisation du défilement : ignorée
    expect(sent().map((e) => e.p)).toEqual(['/', '/fr'])
  })

  it('ne compte rien deux fois si on l’appelle deux fois', () => {
    stop = initAnalytics(OPTIONS)
    initAnalytics(OPTIONS)
    history.pushState(null, '', '/projets')
    expect(sent().map((e) => e.p)).toEqual(['/', '/projets'])
  })

  it('compte un retour arrière', () => {
    stop = initAnalytics(OPTIONS)
    history.replaceState(null, '', '/precedente')
    dispatchEvent(new PopStateEvent('popstate'))
    expect(sent().map((e) => e.p)).toEqual(['/', '/precedente'])
  })

  it('compte un clic sur un lien de CV, même sur un élément enfant', () => {
    document.body.innerHTML =
      '<a href="/cv.pdf" data-dashility-cv><span>Mon CV</span></a><a href="/">Accueil</a>'
    stop = initAnalytics(OPTIONS)
    document.querySelector('span')!.click()
    document.querySelector('a[href="/"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(sent().map((e) => e.t)).toEqual(['view', 'cv'])
  })

  it('compte le CV ouvert au clic molette, pas au clic droit', () => {
    document.body.innerHTML = '<a href="/cv.pdf" data-dashility-cv>CV</a>'
    stop = initAnalytics(OPTIONS)
    const link = document.querySelector('a')!
    link.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    link.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 2 }))
    expect(sent().map((e) => e.t)).toEqual(['view', 'cv'])
  })

  it('ne compte pas une page d’aperçu, mais la suite de la visite', () => {
    history.replaceState(null, '', '/apercu?dashility-preview=jeton')
    stop = initAnalytics(OPTIONS)
    history.pushState(null, '', '/projets')
    expect(sent().map((e) => e.p)).toEqual(['/projets'])
  })

  it('n’envoie rien sous automatisation', () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    stop = initAnalytics(OPTIONS)
    expect(beacon).not.toHaveBeenCalled()
  })

  it('cesse de compter après arrêt', () => {
    stop = initAnalytics(OPTIONS)
    stop()
    history.pushState(null, '', '/apres')
    expect(sent()).toHaveLength(1)
  })
})

describe('lien magique « Ne pas me compter »', () => {
  it('?dashility-ignore=1 exclut le navigateur, nettoie l’URL et confirme', () => {
    history.replaceState(null, '', '/?dashility-ignore=1&autre=2')
    stop = initAnalytics(OPTIONS)

    expect(beacon).not.toHaveBeenCalled()
    expect(location.search).toBe('?autre=2')
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(/ne sont plus comptées/)

    history.pushState(null, '', '/projets')
    expect(beacon).not.toHaveBeenCalled()
  })

  it('?dashility-ignore=0 annule l’exclusion', () => {
    localStorage.setItem('dashility-ignore', '1')
    history.replaceState(null, '', '/?dashility-ignore=0')
    stop = initAnalytics(OPTIONS)

    expect(localStorage.getItem('dashility-ignore')).toBeNull()
    expect(sent()).toHaveLength(1)
  })
})
