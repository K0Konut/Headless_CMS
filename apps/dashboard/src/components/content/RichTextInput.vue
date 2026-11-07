<script setup lang="ts">
import { type RichtextDoc, isValidLink } from '@dashility/shared'
import { Bold, Heading2, Heading3, Highlighter, Italic, Link, List, ListOrdered } from '@lucide/vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { type Component, computed, onBeforeUnmount, watch } from 'vue'
import { richtextExtensions } from '@/lib/richtext'

/** Texte riche (document UX, « Les types de champs ») : éditeur visuel limité, avec sa barre
 *  d'outils. La valeur est le document JSON de Tiptap, ou `null` quand il n'y a pas de texte. */
const props = defineProps<{
  id: string
  label: string
  lang?: 'fr' | 'en'
  invalid?: true
  describedby?: string
}>()
const model = defineModel<unknown>()

const editor = useEditor({
  extensions: richtextExtensions,
  content: (model.value as RichtextDoc | null | undefined) ?? '',
  editorProps: {
    attributes: {
      id: props.id,
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': props.label,
      ...(props.lang && { lang: props.lang }),
      class:
        'richtext min-h-28 px-3 py-2 text-base outline-none md:text-sm [&_a]:underline [&_mark]:bg-yellow-200 dark:[&_mark]:bg-yellow-700',
    },
  },
  onUpdate: ({ editor }) => {
    model.value = editor.isEmpty ? null : editor.getJSON()
  },
})

// Valeur remplacée de l'extérieur (« Annuler les modifications », rechargement) : l'éditeur
// la reprend, sans renvoyer de modification.
watch(model, (value) => {
  const current = editor.value
  if (!current) return
  const mine = current.isEmpty ? null : current.getJSON()
  if (JSON.stringify(mine) === JSON.stringify(value ?? null)) return
  current.commands.setContent((value as RichtextDoc | null) ?? '', { emitUpdate: false })
})

// Attributs d'accessibilité qui changent avec la validation.
watch(
  () => [props.invalid, props.describedby, editor.value] as const,
  ([invalid, describedby]) => {
    const el = editor.value?.view.dom
    if (!el) return
    if (invalid) el.setAttribute('aria-invalid', 'true')
    else el.removeAttribute('aria-invalid')
    if (describedby) el.setAttribute('aria-describedby', describedby)
    else el.removeAttribute('aria-describedby')
  },
  { immediate: true, flush: 'post' },
)
onBeforeUnmount(() => editor.value?.destroy())

/** Lien : demandé dans une boîte native ; une adresse vide retire le lien. */
function editLink() {
  const current = editor.value
  if (!current) return
  const previous = current.getAttributes('link').href as string | undefined
  const href = window.prompt('Adresse du lien (https://… ou mailto:…)', previous ?? 'https://')
  if (href === null) return
  const chain = current.chain().focus().extendMarkRange('link')
  if (!href.trim() || href.trim() === 'https://') return void chain.unsetLink().run()
  if (!isValidLink(href.trim())) {
    window.alert('Adresse invalide : elle doit commencer par https:// ou mailto:')
    return
  }
  chain.setLink({ href: href.trim() }).run()
}

interface Tool {
  label: string
  icon: Component
  active: () => boolean
  run: () => void
}
const tools = computed<Tool[]>(() => {
  const e = editor.value
  if (!e) return []
  const c = () => e.chain().focus()
  return [
    {
      label: 'Gras',
      icon: Bold,
      active: () => e.isActive('bold'),
      run: () => c().toggleBold().run(),
    },
    {
      label: 'Italique',
      icon: Italic,
      active: () => e.isActive('italic'),
      run: () => c().toggleItalic().run(),
    },
    { label: 'Lien', icon: Link, active: () => e.isActive('link'), run: editLink },
    {
      label: 'Liste à puces',
      icon: List,
      active: () => e.isActive('bulletList'),
      run: () => c().toggleBulletList().run(),
    },
    {
      label: 'Liste numérotée',
      icon: ListOrdered,
      active: () => e.isActive('orderedList'),
      run: () => c().toggleOrderedList().run(),
    },
    {
      label: 'Intertitre',
      icon: Heading2,
      active: () => e.isActive('heading', { level: 2 }),
      run: () => c().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Sous-intertitre',
      icon: Heading3,
      active: () => e.isActive('heading', { level: 3 }),
      run: () => c().toggleHeading({ level: 3 }).run(),
    },
    {
      label: 'Mise en avant',
      icon: Highlighter,
      active: () => e.isActive('highlight'),
      run: () => c().toggleHighlight().run(),
    },
  ]
})
</script>

<template>
  <div
    class="rounded-md border border-input shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
    :class="{ 'border-destructive': invalid }"
  >
    <div
      role="toolbar"
      :aria-label="`Mise en forme : ${label}`"
      :aria-controls="id"
      class="flex flex-wrap gap-0.5 border-b p-1"
    >
      <button
        v-for="tool in tools"
        :key="tool.label"
        type="button"
        class="rounded p-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:text-foreground"
        :aria-label="tool.label"
        :title="tool.label"
        :aria-pressed="tool.active()"
        @mousedown.prevent
        @click="tool.run()"
      >
        <component :is="tool.icon" aria-hidden="true" class="size-4" />
      </button>
    </div>
    <EditorContent :editor="editor" />
  </div>
</template>
