import jsdoc from 'eslint-plugin-jsdoc'
import { defineConfig } from 'eslint/config'

import baseConfig from './eslint.config.js'

export default defineConfig([
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      jsdoc,
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
    files: ['**/*.{test,spec}.{ts,tsx}'],
    rules: {
      'jsdoc/require-description': 'off',
      'jsdoc/require-jsdoc': 'off',
    },
  },
])
