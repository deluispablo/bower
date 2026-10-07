# Packet: spine-operations-checkpoints (P3-10)

Starting model: `bower-escalated` (Opus). Reason: resumable operations on the person's Drive, without ever repeating an effect, which is data safety ([TL-P3-21](2026-10-07-tl-p3-21-spine-start.md) points 2 and 3). It starts after `spine-admission-manifest` is merged and builds on its `src/data/spine/` and `runner/src/spine/`.

- **Entry:** `spine-operations-checkpoints`. Checkout `/private/tmp/bower-p3-checkpoints`, branch `claude/p3-checkpoints`, from the commit named in your prompt. Never push or deploy.
- **Read:**
  - Docs: `docs/harness/WORKER.md`, this packet, TL-P3-21, the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`.
  - Contracts: `src/data/contracts/run-checkpoint.ts` and `run-manifest.ts`.
  - The fake: `src/data/fake/fake-run-records.ts` (records, names, `chain`) and `src/data/fake/fake-run-service.ts` (admission of the first checkpoint, applying operations, `materialize`).
  - What exists already: `src/data/spine/` (from the manifest entry), and `runner/src/drive.ts`, `runner/src/spine/`, `runner/src/token.ts`.
- **Stub first:** commit new modules as stubs on their own before behaviour.
- **Acceptance contract:**
  - **Extract, don't port.**
    - The record naming, checkpoint writing, chain reading and `verifyCheckpointChain` use move from `fake-run-records.ts` and `fake-run-service.ts` into `src/data/spine/` over `FencedDrive`, a clock and an id source. The fake's files call them, and their behaviour is unchanged: their tests and `pnpm e2e:fake` stay green.
    - Extract only these steps. The report barrier and dispositions belong to `spine-report-barrier-dispositions`.
  - **The runner writes the chain.** `runner/src/spine/` writes the manifest record (from the token route's manifest) and the first checkpoint in `.bower/runs/<run_id>/` before any operation. Then it writes one checkpoint per applied operation, all through the adapter's fenced writes.
  - **Resume.** A runner that restarts on the same run, or a new attempt, reads **only** `.bower/runs/<run_id>/`, verifies the chain, and continues after the last applied operation. An operation recorded as applied is never applied again. A broken or unverifiable chain stops the run as failed, and nothing is written.
  - **Retention.** After the run's end, the run folders in `.bower/runs/` beyond the newest 20 finished go to the Drive Bin through the fenced `trash`, never a hard delete.
  - **Named tests, red first:**
    - app: `the shared operations give the same chain on the fake and on Drive`;
    - runner: `a restarted runner resumes after its last checkpoint`, `an applied operation is never applied twice`, `only the last 20 finished run folders are kept`.
  - **Files in scope:** `src/data/spine/**`, `src/data/fake/fake-run-records.ts`, `src/data/fake/fake-run-service.ts` and their tests; `runner/src/spine/**` and its tests.
- **Out of scope:** the report barrier and dispositions, the scripted semantic provider, the workflow, the bower-home replacement, and status reports to the Worker.
- **Gates:** the verify (red first on assertions), `pnpm check` in full, and `pnpm e2e:fake` in full on private ports 5195–5198. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
