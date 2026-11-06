import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
  { ignores: ['**/dist/', '**/coverage/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: {
      // TypeScript vérifie déjà les noms et le caractère optionnel des props.
      'no-undef': 'off',
      'vue/require-default-prop': 'off',
    },
  },
  {
    // Composants générés par shadcn-vue, nommés comme dans sa bibliothèque.
    files: ['apps/dashboard/src/components/ui/**'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    rules: {
      // Permet d'écarter un champ par décomposition : const { secret, ...rest } = obj
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  prettier,
)
