import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'mock/dist', 'mock/base', 'mock/nuevo']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // El servidor y las pruebas corren en Node, no en el navegador:
  // ahí sí existen Buffer, process y el resto.
  {
    files: ['functions/**/*.js', 'pruebas/**/*.js', 'mock/*.js', 'tools/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
])