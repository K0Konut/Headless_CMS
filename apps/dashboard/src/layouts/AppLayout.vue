<script setup lang="ts">
import { Blocks, ChartColumn, ChevronRight, FileText, Settings } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { lastSpace } from '@/lib/navigation'
import { useContentStore } from '@/stores/content'
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

// Types sous « Contenu » (document UX, « Mise en page commune ») : relus à chaque navigation
// dans l'espace, pour suivre Structure et les publications.
const content = useContentStore()
watch(
  () => route.path,
  () => {
    if (slug.value) void content.load(slug.value)
  },
  { immediate: true },
)
const inContent = computed(() => ['content', 'entries', 'trash'].includes(String(route.name)))
const contentTypes = computed(() => {
  const ready = (content.space === slug.value ? content.types : null)?.filter(
    (t) => t.fields.length,
  )
  // Collections puis pages, chacune dans l'ordre de Structure.
  return ready
    ? [...ready].sort((a, b) => Number(a.kind === 'single') - Number(b.kind === 'single'))
    : []
})
// Dépliés dans Contenu, repliés ailleurs ; le chevron les déplie à la main.
const contentOpen = ref(false)
watch(inContent, (value) => (contentOpen.value = value), { immediate: true })
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
                  :is-active="inContent"
                  class="data-[active=true]:text-sidebar-primary"
                >
                  <RouterLink :to="`/espaces/${space.slug}/contenu`">
                    <FileText aria-hidden="true" />Contenu
                  </RouterLink>
                </SidebarMenuButton>
                <template v-if="contentTypes.length">
                  <SidebarMenuAction
                    :aria-expanded="contentOpen"
                    aria-controls="types-contenu"
                    :aria-label="
                      contentOpen ? 'Masquer les types de contenu' : 'Afficher les types de contenu'
                    "
                    @click="contentOpen = !contentOpen"
                  >
                    <ChevronRight
                      :class="['motion-safe:transition-transform', contentOpen && 'rotate-90']"
                      aria-hidden="true"
                    />
                  </SidebarMenuAction>
                  <SidebarMenuSub v-show="contentOpen" id="types-contenu">
                    <SidebarMenuSubItem v-for="type in contentTypes" :key="type.slug">
                      <SidebarMenuSubButton
                        as-child
                        :is-active="route.params.type === type.slug"
                        class="data-[active=true]:bg-primary/10 data-[active=true]:font-medium data-[active=true]:text-primary"
                      >
                        <RouterLink :to="`/espaces/${space.slug}/contenu/${type.slug}`">
                          <span>{{ type.name }}</span>
                        </RouterLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </template>
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
