# Packet: done-sh-runner-paths (P3-9)

Starting model: `bower-implementer` (Sonnet). Reason: the same harness change `done-sh-api-paths` made for `api/`. That entry climbed from Haiku to Sonnet, so this one starts on Sonnet.

- **Entry:** `done-sh-runner-paths`. Checkout `/private/tmp/bower-p3-rpaths`, branch `claude/p3-rpaths`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `scripts/harness-git.mjs` (`CODE_PATHS`, `TEST_PATTERN`), `scripts/harness-rules.mjs` (`apiTests`, the verify parsing that picks `api` for `pnpm -C api`), `scripts/check-harness.mjs`, `src/harness-git.test.ts`, `src/harness.test.ts` (the `done-sh-api-paths` tests are the pattern), and `runner/vitest.config.ts` (it already writes `runner/test-results/unit.json`).
- **Acceptance contract:**
  - `runner` joins `CODE_PATHS`. `^runner\/test\/` (and `*.test.ts`, already covered) joins `TEST_PATTERN`.
  - `harness-rules.mjs` gains a `runnerTests` reader like `apiTests`. A verify part with `pnpm -C runner` (or `--dir runner`) is kind `runner` and is checked against those titles.
  - `check-harness.mjs` reads them as it does the api's.
  - Named tests, red first:
    - `done.sh sees a change under runner/ as code and runner tests as tests` in `src/harness-git.test.ts`;
    - `the harness check finds a verify's titles among the runner tests` in `src/harness.test.ts`.
  - Every existing harness test stays green. No other entry's verify changes.
  - Files in scope: `scripts/harness-git.mjs`, `scripts/harness-rules.mjs`, `scripts/check-harness.mjs`, and the two test files.
- **Gates:** the verify (red first on assertions) and `pnpm check` in full. Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
