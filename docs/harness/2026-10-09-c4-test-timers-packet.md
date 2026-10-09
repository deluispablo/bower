# Packet: c4-test-timers (stage 4, after the Codex-finding fixes)

- **Entry:** `c4-test-timers` (harness and test, with one escalated-review part). Worktree `/private/tmp/bower-c4-timers`, branch `c4-test-timers` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-17 addendum 10 (the allowlist);
  - TL-P4-22 addenda 11 and 13 (main f01eda6c);
  - the diagnosis [load-timeouts](defects/2026-10-09-load-timeouts.md);
  - DEFECT_LOG `size-cap-test-timeout-under-load`, `per-thing-ask-timeout-under-load`, `import-rule-timeout-under-load`, `vite-outdated-optimize-dep` and `focus-axe-contrast-flaky`;
  - `c3-timer-gate`.
- **Starting model:** `bower-implementer` (Sonnet). Part 1 gets an escalated review (addendum 13 (1)).

## Contract (addendum 13)

1. **One byte table per note** (escalated review).
   - `rawByteAt` at `src/data/vault/ownership-format.ts:129` builds one char-to-byte table per note, in the same home.
   - If a run parses a note more than once, it parses it once.
   - Option (c), load-scaled timeouts, is rejected.
   - Red: `the size-cap run fits its time bound with no load`. The old code misses that bound on an idle machine; name the bound and how you measured it.
2. **One heavy-run lock, re-entrant.**
   - `harness/with-lock.sh` becomes re-entrant through `HARNESS_LOCK_HELD`, so a nested call inside a run that holds the lock passes through.
   - `pnpm check` and every e2e script (`e2e`, `e2e:fake`, `e2e:pwa`, `scripts/e2e-both.sh`) go through it, and so do `done.sh:64` and `:108`.
   - No globalSetup lock.
   - Red: `a second heavy run waits for the first`.
3. **Vite.** Add `optimizeDeps.include` plus `server.warmup` in `vite.config.ts`.
   - Try to reproduce the 504 "Outdated Optimize Dep" first, as done.sh does: revert files, put them back, run the e2e.
   - If it reproduces, the reproduction becomes the red.
   - If it cannot be reproduced, add the change as prevention, with a note saying so.
4. **The axe helper waits for animations.** The one shared axe helper waits for every running animation in its scope to finish (`document.getAnimations()`, with `finished`) before it analyses. Specs keep no local copies; any that exist move to the one helper. Red: `axe runs after the sheet's animations end`.
5. **The rest of the scope:**
   - the 22-name `harness/real-timers.json` allowlist reaches its empty target, moving the tests to fake timers or event waits;
   - per-kind `test.for` where one test covers many cases;
   - a CPU-time report from check-harness, as a report and never a failure;
   - a mechanism-map row for "heavy-run lock and timer gate".

## Verify (exact names)

- `the size-cap run fits its time bound with no load`
- `a second heavy run waits for the first`
- `axe runs after the sheet's animations end`
- `the timer allowlist may only shrink` (the allowlist is now empty)
- `pnpm check` green, plus the full `pnpm e2e:fake` with `E2E_BATCH=1`, under the lock, with no flaky test.

## Commits

Part 1 goes first, as its own red and fix (for the escalated review), then the rest. The notes go in their own commit (`docs/harness/2026-10-09-c4-test-timers-notes.md`), with `tests changed:` lines for every test moved off real timers. The card carries `worktree:`.
