# Packet: routing-test-from-app (P3-13 review fix)

Starting model: `bower-mechanical` (Haiku). Reason: a test-only fix with a clear failing case. The P3-13 delta review found that `api/test/routing.test.ts` checks a route list typed by hand. A route added to `index.ts` (the reviewer tried `app.get('/export', …)`) still passed, so the bug that broke the first real run could come back unseen.

- **Entry:** `routing-test-from-app`. Checkout `/private/tmp/bower-p3-routing`, branch `claude/p3-routing`, from the commit named in your prompt. Never push or deploy, and never run `wrangler`.
- **Read:** `docs/harness/WORKER.md`, this packet, `api/test/routing.test.ts`, `api/src/index.ts` (`createApp`), `api/wrangler.jsonc` and `vite.config.ts`.
- **Acceptance contract:**
  - **Red first.** Add the test `a route added to the app is checked too` and commit it on its own:
    - It builds the app with `createApp(...)`, as the other api tests do.
    - It registers an extra `app.get('/export-probe', …)` on that instance.
    - It asserts that the coverage check reports `/export-probe` as uncovered.
    - It must fail against today's typed list.
  - **Fix.**
    - `every Worker route runs the Worker first` takes every method and path from the app's `routes` (Hono's route list), not a typed list. Drop Hono's middleware-only entries.
    - Pattern matching: an exact path, or `/prefix/*` covering `/prefix` and `/prefix/...` only. `/auth/*` must not cover `/authx`.
    - Use `expect(...)`, never a thrown `Error`, so a failure is an assertion.
  - **Service worker.** In `vite.config.ts`, add `health` to `navigateFallbackDenylist` and drop `runs` and `push`, which are not Worker routes. Keep `runner` out, because only a browser navigates.
  - **Files in scope:** `api/test/routing.test.ts` and `vite.config.ts`.
- **Gates:**
  - the verify, red first on the assertion;
  - `pnpm check` in full;
  - `pnpm e2e:pwa` (the service worker changed).
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
