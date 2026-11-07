<script setup lang="ts">
import { Blocks, ChartColumn, FileText, Settings } from '@lucide/vue'
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import SpaceSwitcher from '@/components/SpaceSwitcher.vue'
import UserMenu from '@/components/UserMenu.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { lastSpace } from '@/lib/navigation'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()

const slug = computed(() =>
  typeof route.params.espace === 'string' ? route.params.espace : undefined,
)
/** Espace de l'URL ; hors espace (Mon compte), le dernier ouvert reste dans la navigation. */
const space = computed(() =>
  slug.value ? session.spaces.find((s) => s.slug === slug.value) : lastSpace(session.spaces),
)
</script>

<template>
  <a
    href="#contenu"
    class="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
  >
    Aller au contenu
  </a>
  <SidebarProvider>
    <Sidebar>
      <SidebarHeader>
        <SpaceSwitcher
          :current="space"
          :spaces="session.spaces"
          :can-create="!!session.me?.user.isSuperAdmin"
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup v-if="space">
          <nav aria-label="Espace">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  as-child
                  :is-active="route.name === 'analytics'"
                  class="data-[active=true]:text-sidebar-primary"
                >
                  <RouterLink :to="`/espaces/${space.slug}/analytics`">
                    <ChartColumn aria-hidden="true" />Analytics
                  </RouterLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  as-child
                  :is-active="['content', 'entries', 'entry'].includes(String(route.name))"
                  class="data-[active=true]:text-sidebar-primary"
                >
                  <RouterLink :to="`/espaces/${space.slug}/contenu`">
                    <FileText aria-hidden="true" />Contenu
                  </RouterLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <!-- Structure : super-admin uniquement (document UX). -->
              <SidebarMenuItem v-if="session.me?.user.isSuperAdmin">
                <SidebarMenuButton
                  as-child
                  :is-active="route.name === 'structure'"
                  class="data-[active=true]:text-sidebar-primary"
                >
                  <RouterLink :to="`/espaces/${space.slug}/structure`">
                    <Blocks aria-hidden="true" />Structure
                  </RouterLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  as-child
                  :is-active="route.name === 'settings'"
                  class="data-[active=true]:text-sidebar-primary"
                >
                  <RouterLink :to="`/espaces/${space.slug}/reglages`">
                    <Settings aria-hidden="true" />Réglages
                  </RouterLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
    <SidebarInset>
      <header class="flex h-12 items-center gap-2 border-b px-4 md:hidden">
        <SidebarTrigger aria-label="Ouvrir le menu" />
        <span class="truncate font-semibold">{{ space?.name ?? 'Dashility' }}</span>
      </header>
      <main
        id="contenu"
        tabindex="-1"
        class="w-full max-w-5xl px-4 py-8 outline-none md:px-10 md:py-10"
      >
        <!-- Un espace inaccessible est routé vers « Page introuvable » par le garde du routeur. -->
        <RouterView />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
