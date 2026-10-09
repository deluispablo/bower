# Packet: P4-52 review (c4-test-timers; part 1 escalated, TL-P4-22 addendum 13 (1))

This review is read-only and fresh. Run unit tests only; never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-timers`.

## What to review

- **Diff:** `git diff e1f5bbe16fd3842ae533d86be544634a88b737e3..c4-test-timers`. There are 17 commits; notes are in 54ed3c1e, `docs/harness/2026-10-09-c4-test-timers-notes.md`.
- **Packet:** `docs/harness/2026-10-09-c4-test-timers-packet.md` (TL-P4-22 addenda 11 and 13).
- **Fixed questions (TL-P4-20):** check the contract first, then look for a second way: a second lock, a second axe helper, or a second timer gate. Give every finding a severity.

## Part 1, escalated: look hardest here

- **Red 5824b7c5, reshaped in f55f8fc5; fix 65ceae64.** `rawByteAt` (`src/data/vault/ownership-format.ts:129`) builds one char-to-byte table per note, in the same home.
  - The bound is now counted in encoded characters, not CPU seconds. Is that bound honest, and does the old code really miss it?
  - Is the ownership parse byte-exact, with the same results as before for multi-byte text?
- **Contract point 1 says "If a run parses a note more than once, it parses it once."** The card lists "parse-once across 13 call sites (b1)" as left out. Decide whether that is a contract gap or a fair split, and say which.

## The rest

- **Lock (f7011429, 1d6dd4e6).** `with-lock.sh` is re-entrant through `HARNESS_LOCK_HELD`. `pnpm check`, every e2e script and `done.sh` go through it, with no globalSetup lock. Check for a deadlock when done.sh calls check under the lock.
- **Vite (78fddccb, fa687993).** `optimizeDeps.include` and `server.warmup` (`vite.deps.ts`). The 504 did not reproduce, so this is prevention only, and the notes must say so.
- **Axe (535bc9f0, a1148af0).** The one shared helper (`e2e/axe.ts`) waits for `document.getAnimations()` to finish. Specs keep no local copies; check every `AxeBuilder` use in `e2e/`.
- **Timers (a6f8b906, 2b0c9552 and later).** The allowlist is empty and may only shrink. Tests move to fake time or event waits: check that no test lost its assertion in the move. The latency fake's clock jump (919d97c5) must not hide a real wait.
  - The card lists the import-rule spawn tests (a3) as left out. Is that consistent with an empty allowlist?
- **CPU report.** It is a report, never a failure.
- **Housekeeping:** the mechanism-map row is present, the `tests changed:` lines cover every moved test, and there is no `.only` or `.skip`.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters.
