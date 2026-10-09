# c3-test-tamper notes

- Rule home: `testsChangedProblems` in `scripts/harness-rules.mjs`. `scripts/check-harness.mjs` runs it (default base `claude/p3`, tips from `historyTips`); `harness/integrate.sh` calls `check-harness.mjs --tests-changed HEAD` after the merge starts and before the check.
- Focused or skipped unit tests: `@vitest/eslint-plugin` (`no-focused-tests`, `no-disabled-tests`) added as a devDependency, shared by the three ESLint configs through `scripts/eslint-test-rules.mjs`.
- Playwright: `forbidOnly: true` in both configs (https://playwright.dev/docs/api/class-testconfig#test-config-forbid-only).
- Tests live in `src/harness.test.ts` (lint, forbidOnly) and `src/harness-git.test.ts` (integration, check-harness flag).
- Left out: merging `claude/p3` into `main` through integrate.sh would judge its whole history against `main`; that path does not use integrate.sh today.

tests changed: src/harness.test.ts: added the lint and forbidOnly tests, and copies harness-git.mjs into the scratch scripts folder, which check-harness now imports.
tests changed: src/harness-git.test.ts: added the tests-changed integration and check-harness tests; no existing assertion changed.
