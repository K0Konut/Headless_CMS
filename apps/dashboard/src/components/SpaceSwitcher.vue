<script setup lang="ts">
import { Check, ChevronsUpDown } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import type { SpaceSummary } from '@/lib/types'

defineProps<{ current?: SpaceSummary; spaces: SpaceSummary[] }>()
</script>

<template>
  <!-- Un seul espace : un simple titre, rien à choisir. -->
  <p v-if="spaces.length <= 1" class="truncate px-2 py-1.5 font-semibold">
    {{ current?.name ?? 'CMS' }}
  </p>
  <SidebarMenu v-else>
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton size="lg" class="font-semibold">
            <span class="truncate">{{ current?.name ?? 'Choisir un espace' }}</span>
            <ChevronsUpDown class="ml-auto" aria-hidden="true" />
            <span class="sr-only">Changer d’espace</span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-(--reka-dropdown-menu-trigger-width) min-w-56">
          <DropdownMenuLabel class="text-muted-foreground">Espaces</DropdownMenuLabel>
          <DropdownMenuItem v-for="space in spaces" :key="space.slug" as-child>
            <RouterLink :to="`/espaces/${space.slug}/analytics`">
              <span class="truncate">{{ space.name }}</span>
              <Check
                v-if="space.slug === current?.slug"
                class="ml-auto"
                aria-label="Espace actuel"
              />
            </RouterLink>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
