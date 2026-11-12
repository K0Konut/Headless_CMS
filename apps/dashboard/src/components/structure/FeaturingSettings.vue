<script setup lang="ts">
import { FEATURED_MIN_VIEWS, FEATURED_PLACES, type Featuring, type Field } from '@dashility/shared'
import { computed } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Mise en avant d'une collection (document UX, « Structure : relier un type aux pages du
 *  site ») : les adresses de ses pages, pour relier les vues aux entrées, et le forçage. */
const featuring = defineModel<Featuring | null>({ required: true })
const props = defineProps<{ fields: Field[] }>()

const booleans = computed(() => props.fields.filter((f) => f.type === 'boolean'))
const NONE = '__aucun'

const enabled = computed({
  get: () => !!featuring.value,
  set: (on: boolean) => (featuring.value = on ? { paths: { fr: '' } } : null),
})
const fr = computed({
  get: () => featuring.value?.paths.fr ?? '',
  set: (fr: string) => (featuring.value!.paths.fr = fr),
})
// L'anglais est facultatif : vide, il n'est pas envoyé.
const en = computed({
  get: () => featuring.value?.paths.en ?? '',
  set: (en: string) => {
    if (en) featuring.value!.paths.en = en
    else delete featuring.value!.paths.en
  },
})
const force = computed({
  get: () => featuring.value?.forceField ?? NONE,
  set: (key: string) => {
    if (key === NONE) delete featuring.value!.forceField
    else featuring.value!.forceField = key
  },
})
</script>

<template>
  <section class="grid gap-3" aria-labelledby="featuring-title">
    <h2 id="featuring-title" class="font-semibold">Mise en avant</h2>
    <label class="flex items-start gap-2 text-sm">
      <input v-model="enabled" type="checkbox" class="mt-0.5 size-4 accent-primary" />
      <span>
        Mettre en avant les entrées les plus efficaces ({{ FEATURED_PLACES }} places) : celles dont
        la page fait le plus télécharger le CV, sur 6 mois, à partir de
        {{ FEATURED_MIN_VIEWS }} vues.
      </span>
    </label>
    <div v-if="featuring" class="grid gap-3 sm:pl-6">
      <div class="flex flex-wrap gap-x-4 gap-y-3">
        <div class="grid w-full max-w-72 gap-1.5">
          <Label for="featuring-fr">Pages sur le site (français)</Label>
          <Input
            id="featuring-fr"
            v-model.trim="fr"
            class="font-mono"
            placeholder="/fr/projets/{slug}"
            aria-describedby="featuring-hint"
          />
        </div>
        <div class="grid w-full max-w-72 gap-1.5">
          <Label for="featuring-en">Pages sur le site (anglais, facultatif)</Label>
          <Input
            id="featuring-en"
            v-model.trim="en"
            class="font-mono"
            placeholder="/en/projects/{slug}"
            aria-describedby="featuring-hint"
          />
        </div>
      </div>
      <p id="featuring-hint" class="text-sm text-muted-foreground">
        <code class="rounded bg-muted px-1">{slug}</code> est remplacé par l’identifiant d’URL de
        chaque entrée. Les vues des deux langues s’additionnent.
      </p>
      <div class="grid max-w-72 gap-1.5">
        <Label for="featuring-force">Toujours mis en avant si coché</Label>
        <Select v-model="force">
          <SelectTrigger id="featuring-force" class="w-full" aria-describedby="featuring-force-hint"
            ><SelectValue
          /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="NONE">Aucun</SelectItem>
            <SelectItem v-for="f in booleans" :key="f.key" :value="f.key">{{ f.label }}</SelectItem>
          </SelectContent>
        </Select>
        <p id="featuring-force-hint" class="text-sm text-muted-foreground">
          {{
            booleans.length
              ? 'Une entrée cochée prend une place avant le classement.'
              : 'Ajoutez un champ « oui / non » pour pouvoir forcer une entrée.'
          }}
        </p>
      </div>
    </div>
  </section>
</template>
