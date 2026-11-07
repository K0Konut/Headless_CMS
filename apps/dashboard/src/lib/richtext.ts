import { isValidLink } from '@dashility/shared'
import Highlight from '@tiptap/extension-highlight'
import StarterKit from '@tiptap/starter-kit'

/** Extensions de l'éditeur de texte riche, limitées au document UX : paragraphe, gras,
 *  italique, lien, listes, intertitres h2 et h3, mise en avant. Tiptap retire du contenu collé
 *  tout ce que ce schéma ne connaît pas (titres h1 ramenés à h2, tableaux, styles…). La même
 *  liste est vérifiée par l'API (`richtextSchema`). */
export const richtextExtensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    hardBreak: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    heading: { levels: [2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      protocols: ['mailto'],
      // Un lien collé ou tapé hors http(s) et mailto n'est pas créé.
      isAllowedUri: (url) => isValidLink(url),
      HTMLAttributes: { target: null, rel: null },
    },
  }),
  Highlight,
]
