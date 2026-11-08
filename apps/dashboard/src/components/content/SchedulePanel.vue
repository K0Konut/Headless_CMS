<script setup lang="ts">
import { parisDateTime, scheduleIssue } from '@dashility/shared'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parisInputs } from '@/lib/format'
import { addDays, today } from '@/lib/period'

/** « Programmer la publication » (document UX, « Programmer, dans l'éditeur ») : date et heure,
 *  toujours à l'heure de Paris. Par défaut, demain à 9:00 ; pour changer une date, la date prévue.
 *  Les bornes sont celles que l'API vérifie (`scheduleIssue`). */
const props = defineProps<{ initial?: string | null; busy: boolean }>()
const emit = defineEmits<{ submit: [at: string]; cancel: [] }>()

const start = props.initial
  ? parisInputs(new Date(props.initial))
  : { date: addDays(today(), 1), time: '09:00' }
const date = ref(start.date)
const time = ref(start.time)

const at = computed(() =>
  date.value && time.value ? parisDateTime(date.value, time.value) : new Date(NaN),
)
const error = computed(() => scheduleIssue(at.value) ?? '')
const touched = ref(false)

function submit() {
  touched.value = true
  if (!error.value) emit('submit', at.value.toISOString())
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
          :min="today()"
          :max="addDays(today(), 365)"
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
