# Packet: staging-runner-routes (P3-13 fix)

Starting model: `bower-mechanical` (Haiku). Reason: a one-file config fix with a clear failing test. On the first real run on Actions, `GET /runner/runs/:id/token` on staging answered the app's page with 200, because `api/wrangler.jsonc` `assets.run_worker_first` does not list `/runner/*`, so the single-page fallback served it. The runner failed in 13 seconds.

- **Entry:** `staging-runner-routes`. Checkout `/private/tmp/bower-p3-routes`, branch `claude/p3-routes`, from the commit named in your prompt. Never push or deploy, and never run `wrangler`.
- **Read:** `docs/harness/WORKER.md`, this packet, `api/wrangler.jsonc`, `api/src/index.ts` and the route modules it mounts (`api/src/*.ts`, the `.get`/`.post`/`.put`/`.delete`/`.all` calls).
- **Acceptance contract:**
  - **Red first.** Add the test `every Worker route runs the Worker first` to a new `api/test/routing.test.ts`:
    - It reads `api/wrangler.jsonc`. Strip the `//` comments, then `JSON.parse`.
    - It collects every literal path the route modules register, plus `/health` in `index.ts`.
    - It fails for any path that no `run_worker_first` pattern covers. Match a pattern by exact path, or by its prefix when the pattern ends in `/*`. Treat a `:param` segment as matching anything.
    - Commit the test on its own. It must fail on `/runner/runs/:id/token` and `/runner/runs/:id/status`.
  - **Fix.** Add `"/runner/*"` to `run_worker_first`. Change nothing else in the file.
  - **Files in scope:** `api/wrangler.jsonc` and `api/test/routing.test.ts`.
- **Gates:**
  - the verify, red first on the assertion;
  - `pnpm check` in full.
  - No e2e is needed: no app code changes.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
