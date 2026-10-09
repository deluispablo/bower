import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { reservationConfig } from '../scripts/eslint-reservation.mjs';

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2023, globals: globals.node },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  reservationConfig('runner'),
);
