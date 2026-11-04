import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['**/dist/', '**/coverage/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Permet d'écarter un champ par décomposition : const { secret, ...rest } = obj
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  prettier,
)
