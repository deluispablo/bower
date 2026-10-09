import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { reservationConfig } from '../scripts/eslint-reservation.mjs';

export default tseslint.config(
  { ignores: ['node_modules', '.wrangler'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2023, globals: globals.serviceworker },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  reservationConfig('api'),
);
