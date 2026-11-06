<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PRESETS, type Period, oldestDate, today } from '@/lib/period'

const props = defineProps<{ period: Period }>()
const router = useRouter()

/** La période vit dans l'URL : un lien la partage telle quelle. */
function setPreset(value: unknown) {
  if (value === 'custom') {
    return router.replace({ query: { du: props.period.from, au: props.period.to } })
  }
  return router.replace({ query: { periode: String(value) } })
}

function setDates(from: string, to: string) {
  if (from && to && from <= to) void router.replace({ query: { du: from, au: to } })
}
</script>

<template>
  <div class="grid gap-1.5">
    <Label for="periode">Période</Label>
    <Select :model-value="period.preset" @update:model-value="setPreset">
      <SelectTrigger id="periode" class="w-48"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="p in PRESETS" :key="p.value" :value="p.value">{{ p.label }}</SelectItem>
        <SelectItem value="custom">Personnalisée</SelectItem>
      </SelectContent>
    </Select>
  </div>
  <template v-if="period.preset === 'custom'">
    <div class="grid gap-1.5">
      <Label for="du">Du</Label>
      <Input
        id="du"
        type="date"
        class="w-40"
        :min="oldestDate()"
        :max="period.to"
        :model-value="period.from"
        @change="setDates(($event.target as HTMLInputElement).value, period.to)"
      />
    </div>
    <div class="grid gap-1.5">
      <Label for="au">Au</Label>
      <Input
        id="au"
        type="date"
        class="w-40"
        :min="period.from"
        :max="today()"
        :model-value="period.to"
        @change="setDates(period.from, ($event.target as HTMLInputElement).value)"
      />
    </div>
  </template>
</template>
