# Packet: runs-beat-rearm (P3-6 follow-up)

Starting model: `bower-mechanical` (Haiku). Reason: a two-line fix the reviewer already wrote, with two failing tests first (TL-P3-14 addendum).

- **Entry:** `runs-beat-rearm` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-rearm`, branch `claude/p3-rearm`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `src/data/live/runs.ts` (`current`, `refused`, `schedule`, `accepted`, `issued`), and the existing run status tests in `src/data/live/live.test.ts` (`the run status is not asked again after a 4xx` is the pattern).
- **The defects** (P3-6 delta review):
  - (a) After a 4xx, a good answer to `current({ again: true })` clears `refused` but never calls `schedule()`. The beat stays off until a foreground return or a new tidy-up.
  - (b) `refused` is set by generation only. A late 4xx from an older ask, arriving after a newer good answer, stops the beat.
- **The fix:**
  - Set `refused` only when that ask's `ticket` is newer than `this.accepted`.
  - When a good answer clears a `refused` that was set, call `this.schedule()`.
  - Nothing else changes.
- **Named tests in `src/data/live/live.test.ts`, red first on an assertion:**
  - `a good answer after a 4xx restarts the run status beat`: status answers 404, then `current({ again: true })` answers `null`. With subscribers live, 10 minutes of fake time give at least one more `status()` call.
  - `a late 4xx from an older ask does not stop the beat`: an older pending ask rejects `not-found` after a newer ask resolved `null`. 10 minutes of fake time still give `status()` calls.
- **Files in scope:** `src/data/live/runs.ts`, `src/data/live/live.test.ts`.
- **Gates:** the verify, the whole `src/data/live/live.test.ts`, and `pnpm check`. If `pnpm check` times out in `src/data/fake/fake-worker.test.ts`, re-run that file alone and report both. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 8 lines:** commit SHA, red→green, gates.
