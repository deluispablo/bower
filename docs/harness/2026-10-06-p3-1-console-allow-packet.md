# Packet: console guard follow-up (P3-1 batch close)

Starting model: `bower-mechanical` (Haiku). Reason: test-only edits with exact targets and no design choice.

- **Checkout:** `/private/tmp/bower-p3-allow`, branch `claude/p3-allow`. Never push. Read `docs/harness/WORKER.md` and this packet only, plus the named tests and `e2e/console-guard.ts`.
- **Why:** the new console guard (auto fixture, per-test `allowConsole(/pattern/, 'reason')`) fails failure-path tests that log their expected `BowerError`. Logs: `/tmp/p3-1-e2e.log`, `/tmp/p3-1-e2e-fake.log`.
- **Do, inside each test only (never globally), one `allowConsole` per expected message, with a one-line reason naming the refusal the test checks:**
  - `e2e/qa12.spec.ts:5` (both variants): `BowerError: A name cannot start with a dot.`
  - `e2e/robustness.spec.ts:27`: `BowerError: You're offline.`
  - `e2e/robustness.spec.ts:141`: `BowerError: There is already a "Flat 7, Cobble Row" here.`
  - `e2e/qa26.spec.ts:166`: `BowerError: Choose c.pdf again on this device to send it.`
  - `e2e/qa28.spec.ts:102`: `Choose b.pdf again on this device to send it.` and `That isn't the same file. Choose the file you added before.`
  - `e2e/qa28.spec.ts:141`: `Paste the link again on this device to send it.` and `That isn't the same link. Paste the link you added before.`
  Anchor each pattern on the full sentence (escape regex characters).
- **Fix the test's own stub in `e2e/qa26.spec.ts` (around line 173):** its `navigator.locks.request` replacement calls `real(name, opts, cb)` even for the two-argument form `request(name, callback)`, so Chrome throws `TypeError: ... parameter 3 is not of type 'Function'`. Forward the original arguments unchanged (rest parameters) when it does not intercept. Do **not** allowlist that TypeError.
- **Gates:** the four specs on `pnpm e2e` and `E2E_SOURCE=fake pnpm e2e` (both projects), Playwright on a private config on port 5195; `pnpm check`. All must pass with no new `allowConsole` beyond the list above. If another message appears, stop and report it.
- **Deliver, under 10 lines:** commit SHA, files, gate results.
