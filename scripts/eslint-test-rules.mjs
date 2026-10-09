// No focused or skipped unit test in any package (TL-P4-20). The one home of the rule: the three ESLint configs spread it.
// Standard rules of the vitest plugin: https://github.com/vitest-dev/eslint-plugin-vitest (no-focused-tests, no-disabled-tests).
import vitest from '@vitest/eslint-plugin';

/** Flat-config block for a package's unit test files (`files` are globs relative to that package). */
export function testRulesConfig(files) {
  return { files, plugins: { vitest }, rules: { 'vitest/no-focused-tests': 'error', 'vitest/no-disabled-tests': 'error' } };
}
