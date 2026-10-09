import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { testRulesConfig } from '../scripts/eslint-test-rules.mjs';
import { syntaxConfig } from '../scripts/eslint-syntax.mjs';

export default tseslint.config(
  { ignores: ['node_modules', '.wrangler'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2023, globals: globals.serviceworker },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  testRulesConfig(['test/**/*.ts']),
  ...syntaxConfig('api'),
);
