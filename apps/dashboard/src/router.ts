import { createRouter, createWebHistory } from 'vue-router'
import { homePath, rememberSpace } from '@/lib/navigation'
import { useSessionStore } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    /** Accessible sans session. */
    public?: boolean
    /** Premier élément du titre de l'onglet : `<Écran> · <Espace> · CMS`. */
    title?: string
  }
}

export const router = createRouter({
  history: createWebHistory(),
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
        { path: 'espaces/:espace', redirect: (to) => `/espaces/${to.params.espace}/analytics` },
        {
          path: 'espaces/:espace/analytics',
          name: 'analytics',
          component: () => import('@/pages/AnalyticsPage.vue'),
          meta: { title: 'Analytics' },
        },
        {
          path: ':chemin(.*)*',
          component: () => import('@/pages/NotFoundPage.vue'),
          meta: { title: 'Page introuvable' },
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (!session.loaded) await session.load()
  if (to.name === 'login' && session.me) return homePath(session.me)
  if (to.meta.public) return true
  if (!session.me) return { name: 'login', query: { retour: to.fullPath } }
  return true
})

router.afterEach((to) => {
  const session = useSessionStore()
  const slug = typeof to.params.espace === 'string' ? to.params.espace : undefined
  const space = session.spaces.find((s) => s.slug === slug)
  if (space) rememberSpace(space.slug)
  document.title = [to.meta.title, space?.name, 'CMS'].filter(Boolean).join(' · ')
})
