<script setup lang="ts">
import { ChevronsUpDown, LogOut, UserRound } from '@lucide/vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()

async function logout() {
  try {
    await session.logout()
  } catch {
    // La session est peut-être encore ouverte : ne pas laisser croire le contraire.
    alert('La déconnexion a échoué. Vérifiez votre connexion, puis réessayez.')
    return
  }
  await router.push({ name: 'login' })
}
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton>
            <span class="truncate">{{ session.me?.user.email }}</span>
            <ChevronsUpDown class="ml-auto" aria-hidden="true" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          class="w-(--reka-dropdown-menu-trigger-width)"
        >
          <DropdownMenuItem as-child>
            <RouterLink to="/compte"><UserRound aria-hidden="true" />Mon compte</RouterLink>
          </DropdownMenuItem>
          <DropdownMenuItem @select="logout">
            <LogOut aria-hidden="true" />Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
