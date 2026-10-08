# Packet: runner-checkpoint-cost (P4-3, bower-escalated)

The lead approved this after the staging runs. Numbers are in [p4-speed-baseline](p4-speed-baseline.md):
- Three scripted runs took 1:59, 1:30 and 1:21 from press to done.
- Checkpoints cost about 1.9 s each: 46.6 s for 19, then 24 to 28 s for 13. That is half the runner.
- Press to job start takes 25 s, against R3's 2 s from dispatch to job created.

Recovery is the bar. This touches data safety (checkpoints are what makes a killed run resume without duplicates), so it goes to `bower-escalated`.

- **Research first:**
  - cite how the spine's checkpoints are meant to work (`docs/ARCHITECTURE.md`, TL-P3-21 and TL-P3-23);
  - cite the documented Drive v3 ways to cut round trips: one write per checkpoint, `fields`, no separate read-back when the write's answer carries the new `modifiedTime` and `md5Checksum` or `sha256Checksum`.
- **Read:**
  - `runner/src/spine/records.ts`, `runner/src/spine/run.ts`, `runner/src/effects.ts` and `runner/src/drive.ts`;
  - `runner/test/checkpoints.test.ts`, the recovery and kill tests, `runner/test/overhead.test.ts`;
  - `api/src/process.ts` and `api/src/runner.ts` (admission and dispatch).
- **Do:**
  1. **Split the 25 s first.** Log admission in parts in the Worker: session and lease, manifest and pile-note reads, the dispatch call. Numbers only.
     - Say which part is the Worker's and which is GitHub's queue.
     - Cut only the Worker's part, and only where its tests stay green.
  2. **Checkpoint cost.** Find what one checkpoint does now (writes, reads, attempt checks). Cut it:
     - one write, with the read-back replaced by the write's own answer where Drive returns what the check needs;
     - or several operations merged into one checkpoint, **only where every kill-after-every-step test still passes unchanged**.
     - If a test has to change to pass, stop and say so.
  3. Keep the attempt fence before each write, still-as-seen, the read-back reconcile on a lost reply, and the report barrier order.
- **Named tests:**
  - `checkpoints cost fewer Drive round trips per operation` (runner): count round trips per operation before and after;
  - `a kill after every step still recovers with merged checkpoints` (runner): every step, no duplicates, the same final folder;
  - `admission timing is logged in parts` (api).
- **Rules:**
  - Work in the checkout and branch in your prompt. Never push, deploy, call `gh`, `wrangler`, `claude` or any live service.
  - Red tests first, on their own commit; then the code in one commit if you can, at most two.
  - Gates: the verify, the runner and api suites in full, `pnpm check`. Never write harness records or run `done.sh`.
- **Reply:** the implementer delivery card, every line under 120 characters, with modelled before and after per checkpoint. Details go in a notes file.
