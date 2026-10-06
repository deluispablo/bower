# Packet: done-sh-api-paths (P3 tooling, TL-P3-03)

Starting model: `bower-mechanical` (Haiku), as the lead ruled. Reason: tooling with clear failing tests; climb to `bower-implementer` if the verify parsing needs design.

- **Entry:** `done-sh-api-paths` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-donesh`, branch `claude/p3-donesh`. Never push.
- **Read:** `docs/harness/WORKER.md`, this packet, `harness/done.sh` lines 40–100, `scripts/harness-rules.mjs` (verify parsing, lines 15–120), `scripts/check-harness.mjs` (how it collects the test names), `src/harness-git.test.ts` and `src/harness.test.ts` (their patterns).
- **Why now:** root `pnpm check` is red: `worker-skeleton`'s verify (`pnpm -C api exec vitest run -t "…"`) is checked against the app's unit tests only, so its three titles "match no test".
- **Acceptance contract:**
  - `harness/done.sh`: `paths` includes `api`; `excl` keeps treating `api/test/` and `api/**/*.test.ts` as tests (not code).
  - Named test in `src/harness-git.test.ts`: `done.sh sees a change under api/ as code and api tests as tests`. A throwaway repo with a commit that changes `api/src/x.ts` and `api/test/x.test.ts`: the code-file selection (the `fix=` / `code=` logic, extracted or exercised as the existing tests do) returns `api/src/x.ts` and not the test file. Red first on an assertion with today's `paths`.
  - The harness check: a verify of the form `pnpm -C api exec vitest run [files] -t "…"` is parsed as an api unit verify and its titles are matched against the api's tests (collect them the same way the app's unit test names are collected, run inside `api/`). Named test in `src/harness.test.ts`: `the harness check finds a verify's titles among the api tests` (an api verify whose title exists passes; one whose title does not is reported). Red first.
  - After the change, root `pnpm check` is green on this branch (worker-skeleton's titles resolve).
  - Files in scope: `harness/done.sh`, `scripts/harness-rules.mjs`, `scripts/check-harness.mjs`, `src/harness-git.test.ts`, `src/harness.test.ts`.
- **Gates:** the verify, `pnpm check`.
- **Deliver, under 10 lines:** commit SHA, files, red→green, gates.
