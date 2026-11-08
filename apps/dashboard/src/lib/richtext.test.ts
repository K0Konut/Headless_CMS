import { richtextSchema } from '@dashility/shared'
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { richtextExtensions } from '@dashility/shared/richtext'

let editor: Editor | undefined
afterEach(() => editor?.destroy())

/** Document produit par l'éditeur à partir d'un HTML collé. */
function fromHtml(html: string) {
  editor = new Editor({ extensions: richtextExtensions, content: html })
  return editor.getJSON()
}

describe('éditeur de texte riche', () => {
  it('produit des documents que l’API accepte', () => {
    const doc = fromHtml(
      '<h2>Contexte</h2><p><strong>Gras</strong>, <em>italique</em>, <mark>mis en avant</mark>, ' +
        '<a href="https://exemple.fr">lien</a></p><ol><li><p>Un</p><ul><li><p>Deux</p></li></ul></li></ol>',
    )
    expect(richtextSchema.safeParse(doc).error?.issues).toBeUndefined()
  })

  it('ne garde du collage que les mises en forme permises', () => {
    const doc = fromHtml(
      '<h1>Titre</h1><h4>Petit</h4><p style="color:red"><s>barré</s> <u>souligné</u> ' +
        '<code>code</code><br>suite</p><blockquote>citation</blockquote><table><tr><td>case</td></tr></table>' +
        '<p><a href="javascript:alert(1)">piège</a></p><hr><pre>bloc</pre>',
    )
    expect(richtextSchema.safeParse(doc).error?.issues).toBeUndefined()
    const json = JSON.stringify(doc)
    expect(json).toContain('case')
    expect(json).not.toContain('javascript')
  })
})
