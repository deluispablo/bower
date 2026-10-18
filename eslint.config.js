import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { testRulesConfig } from './scripts/eslint-test-rules.mjs';
import { syntaxConfig } from './scripts/eslint-syntax.mjs';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'scripts', 'api', 'runner', 'e2e/_explore-*', '_AgentMethod'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // A leading underscore marks a value left out on purpose (`const { a: _a, ...rest } = x`).
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  testRulesConfig(['src/**/*.test.{ts,tsx}']),
  ...syntaxConfig('root'),
  {
    files: ['e2e/**/*.spec.ts'],
    rules: {
      'no-restricted-properties': ['error', {
        property: 'setViewportSize',
        message: 'Use resize from e2e/viewport.ts to wait for the shell after crossing its breakpoint.',
      }],
    },
  },
);
