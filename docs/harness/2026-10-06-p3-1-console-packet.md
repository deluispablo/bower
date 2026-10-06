# Packet: no-console-errors-on-journeys (P3-1)

Starting model: `bower-implementer` (Sonnet). Reason: a shared e2e fixture ([TL-P3-01](2026-10-06-tl-p3-01-p3-start.md)).

- **Entry:** `no-console-errors-on-journeys` in `harness/features.json` (query with `jq`). Checkout `/private/tmp/bower-p3-console`, branch `claude/p3-console`. Never push.
- **Research first:** cite the Playwright guidance for console and page-error listeners (`page.on('console')`, `page.on('pageerror')`, fixtures with `use`), in the delivery.
- **Acceptance contract:**
  - A fixture in `e2e/fixtures.ts` (or a new `e2e/console-guard.ts` re-exported there) collects `console.error` and `pageerror` per test and fails the test after it runs on any message not on the allowlist, printing the messages.
  - The allowlist is short and named: each entry is a pattern plus a one-line reason. Expected `BowerError` logs from failure-path tests are allowed only inside those tests (a per-test opt-in such as `allowConsole(/pattern/, 'reason')`), never globally.
  - Named tests in `e2e/console-guard.spec.ts`: `console guard: an unexpected console error fails the test` (self-test, e.g. `test.fail()` around an injected `console.error`) and `console guard: an allowlisted error passes with its reason`. Red first on an assertion.
  - Adopted by `e2e/capabilities.spec.ts`, `e2e/capabilities-b.spec.ts` and `e2e/focus-after-close.spec.ts`, on demo and fake. If they surface a real unexpected error, report it with its message; do not allowlist it to make the run green.
  - Files in scope: `e2e/fixtures.ts`, `e2e/console-guard.ts`, `e2e/console-guard.spec.ts`, the three adopting specs (imports and per-test opt-ins only). No production code change.
- **Gates:** the verify; the three adopting specs on `pnpm e2e` and `E2E_SOURCE=fake`; `pnpm check`. Playwright on a private config on port 5196 (the other P3-1 worker runs no Playwright). The quiet-gates hook filters plain gate commands.
- **Deliver, under 15 lines:** commit SHA, files, red→green evidence, gate results, any real errors found, sources, left out.
