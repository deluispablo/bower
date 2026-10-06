# Packet: focus-timers-after-teardown

Starting model: `bower-mechanical` (Haiku). Reason: one-file fix with a clear failing test.

- **Entry:** `focus-timers-after-teardown` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-focustimers`, branch `claude/p3-focustimers`. Never push.
- **Read:** `docs/harness/WORKER.md`, this packet, `src/ui/focus.ts`, `src/ui/focus.test.ts`.
- **Problem:** `pnpm check` sometimes fails with an unhandled `ReferenceError: document is not defined` from a `setTimeout` or `MutationObserver` callback in `src/ui/focus.ts` (`focusMain`, `focusHeading`, `returnFocusTo`, `focusRouteHeading`) that fires after a jsdom test file's environment is gone (seen from `src/data/runner-errors.test.tsx`).
- **Acceptance contract:**
  - Every callback in `focus.ts` that runs later returns at once when `typeof document === 'undefined'` (one small guard helper), and observers disconnect in that case. No behaviour change in the browser.
  - Named test in `src/ui/focus.test.ts`: `focus timers do nothing once the page is gone`: schedule each of the delayed functions with fake timers, make `document` undefined (e.g. `vi.stubGlobal('document', undefined)`), advance the timers, assert nothing throws; restore. Red first on that assertion.
  - Files in scope: `src/ui/focus.ts`, `src/ui/focus.test.ts`.
- **Gates:** the verify, `pnpm check`. Never write `harness/` records or run `done.sh`.
- **Deliver, under 10 lines:** commit SHA, red→green (the failing assertion), gates.
