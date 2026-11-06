import { createRouter, createWebHistory } from 'vue-router'
import { homePath, rememberSpace, safeReturn } from '@/lib/navigation'
import { useSessionStore } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** Accessible sans session. */
    public?: boolean
    /** Premier élément du titre de l'onglet : `<Écran> · <Espace> · Dashility`. */
    title?: string
    /** Réservé au super-admin ; les autres voient « Page introuvable ». */
    superAdmin?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  // Retour arrière : position restaurée. Les ancres sont gérées par les pages, une fois leur
  // contenu chargé.
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    {
      path: '/connexion',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { public: true, title: 'Connexion' },
    },
    {
      path: '/invitation/:jeton',
      component: () => import('@/pages/TokenPage.vue'),
      props: (route) => ({ token: route.params.jeton, kind: 'invitation' }),
      meta: { public: true, title: 'Invitation' },
    },
    {
      path: '/reinitialisation/:jeton',
      component: () => import('@/pages/TokenPage.vue'),
      props: (route) => ({ token: route.params.jeton, kind: 'reset' }),
      meta: { public: true, title: 'Nouveau mot de passe' },
    },
    {
      path: '/indisponible',
      name: 'unavailable',
      component: () => import('@/pages/UnavailablePage.vue'),
      meta: { public: true, title: 'Serveur indisponible' },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          // Garde plutôt que `redirect` : une redirection est calculée avant le chargement de la
          // session par le garde global.
          path: '',
          name: 'home',
          component: () => import('@/pages/NotFoundPage.vue'),
          beforeEnter: () => homePath(useSessionStore().me!),
        },
        {
          path: 'aucun-espace',
          component: () => import('@/pages/NoSpacePage.vue'),
          meta: { title: 'Aucun espace' },
        },
        {
          path: 'compte',
          name: 'account',
          component: () => import('@/pages/AccountPage.vue'),
          meta: { title: 'Mon compte' },
        },
        {
          path: 'espaces/nouveau',
          component: () => import('@/pages/NewSpacePage.vue'),
          meta: { title: 'Nouvel espace', superAdmin: true },
        },
        { path: 'espaces/:espace', redirect: (to) => `/espaces/${to.params.espace}/analytics` },
        {
          path: 'espaces/:espace/analytics',
          name: 'analytics',
          component: () => import('@/pages/AnalyticsPage.vue'),
          meta: { title: 'Analytics' },
        },
        {
          path: 'espaces/:espace/structure/:type?',
          name: 'structure',
          component: () => import('@/pages/StructurePage.vue'),
          meta: { title: 'Structure', superAdmin: true },
        },
        {
          path: 'espaces/:espace/reglages',
          name: 'settings',
          component: () => import('@/pages/SettingsPage.vue'),
          meta: { title: 'Réglages' },
        },
        {
          path: ':chemin(.*)*',
          name: 'not-found',
          component: () => import('@/pages/NotFoundPage.vue'),
          meta: { title: 'Page introuvable' },
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.name === 'unavailable') return true
  const session = useSessionStore()
  const slug = typeof to.params.espace === 'string' ? to.params.espace : undefined
  try {
    // Espace inconnu de la session : il a pu être créé ou rejoint depuis, on relit avant de
    // conclure qu'il n'existe pas.
    if (!session.loaded || (slug && session.me && !session.spaces.some((s) => s.slug === slug))) {
      await session.load()
    }
  } catch {
    return { name: 'unavailable', query: { retour: to.fullPath } }
  }
  if (to.name === 'login' && session.me) {
    return safeReturn(to.query.retour) ?? homePath(session.me)
  }
  if (to.meta.public) return true
  if (!session.me) return { name: 'login', query: { retour: to.fullPath } }
  // Espace inaccessible ou écran réservé : « Page introuvable », à la même URL. La décision est
  // prise ici, une fois par navigation, et non par la mise en page : la session peut changer en
  // pleine navigation (renommage, suppression) sans démonter l'écran affiché.
  const forbidden = to.meta.superAdmin && !session.me.user.isSuperAdmin
  if (forbidden || (slug && !session.spaces.some((s) => s.slug === slug))) {
    // Segments décodés : le routeur les réencode, l'URL reste identique.
    const chemin = to.path.slice(1).split('/').map(decodeURIComponent)
    return { name: 'not-found', params: { chemin }, query: to.query, hash: to.hash, replace: true }
  }
  return true
})

router.afterEach((to) => {
  const session = useSessionStore()
  const slug = typeof to.params.espace === 'string' ? to.params.espace : undefined
  const space = session.spaces.find((s) => s.slug === slug)
  if (space) rememberSpace(space.slug)
  document.title = [to.meta.title, space?.name, 'Dashility'].filter(Boolean).join(' · ')
})
