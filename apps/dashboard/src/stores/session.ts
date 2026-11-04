import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, api } from '@/lib/api'
import type { Me } from '@/lib/types'

/** Seul état global du dashboard : l'utilisateur connecté et ses espaces. */
export const useSessionStore = defineStore('session', () => {
  const me = ref<Me | null>(null)
  const loaded = ref(false)
  const spaces = computed(() => me.value?.spaces ?? [])

  async function load() {
    try {
      me.value = await api<Me>('/auth/me')
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err
      me.value = null
    } finally {
      loaded.value = true
    }
  }

  async function login(email: string, password: string) {
    me.value = await api<Me>('/auth/login', { method: 'POST', body: { email, password } })
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    me.value = null
  }

  return { me, loaded, spaces, load, login, logout }
})
