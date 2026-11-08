import Highlight from '@tiptap/extension-highlight'
import StarterKit from '@tiptap/starter-kit'

/** Adresse permise pour un lien : http(s) ou mailto. Recopie de `isValidLink` (index.ts) : ce
 *  fichier n'importe rien du paquet, pour que Node le charge sans configuration. */
function isAllowedLink(value: string) {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** Extensions du texte riche, limitées au document UX : paragraphe, gras, italique, lien, listes,
 *  intertitres h2 et h3, mise en avant. Le dashboard les utilise pour l'éditeur (Tiptap retire du
 *  contenu collé ce que ce schéma ne connaît pas), l'API publique pour produire le HTML servi
 *  aux sites. La même liste est vérifiée par `richtextSchema`. */
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
      // Options d'édition seulement, sans effet sur le HTML produit.
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      protocols: ['mailto'],
      // Un lien collé ou tapé hors http(s) et mailto n'est pas créé.
      isAllowedUri: isAllowedLink,
      HTMLAttributes: { target: null, rel: null },
    },
  }),
  Highlight,
]
