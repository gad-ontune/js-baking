import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        structuredClone: 'readonly',
        Intl: 'readonly',
        Date: 'readonly',
        Math: 'readonly',
        Number: 'readonly',
        String: 'readonly',
        Object: 'readonly',
        Array: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
]
