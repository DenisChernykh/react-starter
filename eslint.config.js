import js from '@eslint/js'
import tanstackQuery from '@tanstack/eslint-plugin-query'
import globals from 'globals'
import jsdoc from 'eslint-plugin-jsdoc'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'coverage',
    'dist',
    'src/shared/api/generated',
    'src/shared/api/generated-zod',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      tanstackQuery.configs['flat/recommended'],
    ],
    plugins: {
      jsdoc,
    },
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'jsdoc/require-description': 'warn',
      'jsdoc/require-jsdoc': [
        'warn',
        {
          contexts: [
            'ExportDefaultDeclaration > ClassDeclaration',
            'ExportDefaultDeclaration > FunctionDeclaration',
            'ExportNamedDeclaration > ClassDeclaration',
            'ExportNamedDeclaration > FunctionDeclaration',
            'ExportNamedDeclaration > TSEnumDeclaration',
            'ExportNamedDeclaration > TSInterfaceDeclaration',
            'ExportNamedDeclaration > TSTypeAliasDeclaration',
            'ExportNamedDeclaration:has(> VariableDeclaration)',
          ],
          require: {
            ArrowFunctionExpression: false,
            ClassDeclaration: false,
            ClassExpression: false,
            FunctionDeclaration: false,
            FunctionExpression: false,
            MethodDefinition: false,
          },
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', 'vite.config.ts', 'vite.config.test.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}'],
    rules: {
      'jsdoc/require-description': 'off',
      'jsdoc/require-jsdoc': 'off',
    },
  },
  {
    files: ['src/shared/ui/button.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        {
          allowExportNames: ['buttonVariants'],
        },
      ],
    },
  },
])
