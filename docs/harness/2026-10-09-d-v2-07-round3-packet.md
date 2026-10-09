# Packet: d-v2-07 round 3 (Codex fix-round pass: 2 Important; contract gaps)

- **Entry:** `d-v2-07`, escalated, `ui: true`. It runs on a fresh Opus session. Worktree `/private/tmp/bower-d-v2-07`, branch `d-v2-07` (at 504e6cbd). Merge `claude/p3` first.
- **Ruling sweep:**
  - the round-1 and round-2 packets;
  - TL-P4-25 addenda 2 (4), 2 (5) and 3 (4);
  - the "Fix-round pass" section of `docs/harness/2026-10-09-codex-d-v2-07-review.md`;
  - the P4-58b minors.
  - P4-58b passed. The Codex pass found two gaps, both reproduced with injected frames.

## Contract

1. **Input never erases a layer script** (Codex 1, `engine.ts:399`; this is the P4-58b minor too).
   - `heard()` cuts a running snap or preen, but `interrupt({ now: true })` must not clear `S.queue`.
   - `now: true` cuts only the running act or pose-loop cycle. The queued script (for example `flyTo(...).then(cb)`) still runs.
   - Addendum 3 (4): a layer tap plays after the current action, and the script is kept.
2. **Focus gaze ends in working poses too** (Codex 2, `engine.ts:1103`). When the focus getter returns null, `gaze()` returns the iris to its pose's own target or rest. This applies in working poses, which never call `rest()`, and it means no stale iris offset.
3. **P4-58b minor:** a keydown with body focus must not drop a live pointer gaze early. Mark recency without nulling an active pointer source.

## Red

- `input during a preen between flights keeps the queued flight and its callback`
- `the iris returns from a lost focus gaze in a working pose` (write pose, focus then blur, within 0.5 s of engine time)
- `a body keydown keeps a live pointer gaze`

## Verify

- The reds, plus every round-1 and round-2 verify.
- e2e: bird-engine, qa6, qa7, qa10, app and robustness, on phone and desktop.
- `pnpm check`, through `bash harness/with-lock.sh`.

## Commits

1. The red.
2. The fix.
3. A notes addendum ("Round 3") with `tests changed:` lines.

Then a Claude delta re-review and a Codex pass on the delta.
