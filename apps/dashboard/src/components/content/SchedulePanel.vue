<script setup lang="ts">
import { parisDateTime } from '@dashility/shared'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parisInputs } from '@/lib/format'

/** « Programmer la publication » (document UX, « Programmer, dans l'éditeur ») : date et heure,
 *  toujours à l'heure de Paris. Par défaut, demain à 9:00 ; pour changer une date, la date prévue. */
const props = defineProps<{ initial?: string | null; busy: boolean }>()
const emit = defineEmits<{ submit: [at: string]; cancel: [] }>()

const MINUTE = 60_000
const YEAR = 366 * 24 * 60 * MINUTE
const tomorrow = parisInputs(new Date(Date.now() + 24 * 60 * MINUTE)).date
const start = props.initial
  ? parisInputs(new Date(props.initial))
  : { date: tomorrow, time: '09:00' }
const date = ref(start.date)
const time = ref(start.time)
const today = parisInputs(new Date()).date
const lastDay = parisInputs(new Date(Date.now() + YEAR - 24 * 60 * MINUTE)).date

const error = computed(() => {
  if (!date.value || !time.value) return 'Choisissez une date et une heure'
  const at = parisDateTime(date.value, time.value).getTime()
  if (at < Date.now() + MINUTE) return 'Choisissez une date à venir'
  if (at > Date.now() + YEAR) return 'Choisissez une date dans l’année qui vient'
  return ''
})
const touched = ref(false)

function submit() {
  touched.value = true
  if (!error.value) emit('submit', parisDateTime(date.value, time.value).toISOString())
}
</script>

<template>
  <form
    class="grid gap-4 rounded-lg border bg-card p-4"
    aria-labelledby="schedule-title"
    novalidate
    @submit.prevent="submit"
  >
    <h2 id="schedule-title" class="font-semibold">Programmer la publication</h2>
    <div class="flex flex-wrap items-end gap-4">
      <div class="grid gap-1.5">
        <Label for="schedule-date">Date</Label>
        <Input
          id="schedule-date"
          v-model="date"
          type="date"
          class="w-44"
          :min="today"
          :max="lastDay"
          :aria-invalid="(touched && !!error) || undefined"
          aria-describedby="schedule-hint schedule-error"
        />
      </div>
      <div class="grid gap-1.5">
        <Label for="schedule-time">Heure</Label>
        <Input
          id="schedule-time"
          v-model="time"
          type="time"
          class="w-32"
          :aria-invalid="(touched && !!error) || undefined"
          aria-describedby="schedule-hint schedule-error"
        />
      </div>
      <p id="schedule-hint" class="pb-2 text-sm text-muted-foreground">heure de Paris</p>
    </div>
    <p v-if="touched && error" id="schedule-error" class="text-sm text-destructive">
      {{ error }}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button type="submit" :disabled="busy">Programmer</Button>
      <Button type="button" variant="outline" :disabled="busy" @click="emit('cancel')">
        Annuler
      </Button>
    </div>
  </form>
</template>
