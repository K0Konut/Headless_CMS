import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { setUnauthorizedHandler } from './lib/api'
import { router } from './router'
import { useSessionStore } from './stores/session'
import './style.css'

const app = createApp(App).use(createPinia()).use(router)

// Session expirée ou fermée ailleurs : retour à la connexion, puis à l'écran d'origine.
setUnauthorizedHandler(() => {
  const session = useSessionStore()
  if (!session.me) return
  session.me = null
  void router.push({ name: 'login', query: { retour: router.currentRoute.value.fullPath } })
})

app.mount('#app')
