# Packet: worker-reads-pile-notes (P3-17)

Starting model: `bower-escalated` (Opus). Reason: admission must take exactly what the run will take, without storing the person's note text. That is a contract and privacy matter ([TL-P3-25](2026-10-07-tl-p3-25-pile-notes-and-the-last-p3-e-entries.md) points 2 and 3; TL-P3-21).

- **Entry:** `worker-reads-pile-notes`. Checkout `/private/tmp/bower-p3-notes`, branch `claude/p3-notes`, from the commit named in your prompt. Never push or deploy, and never run `gh` or `wrangler`.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, TL-P3-25, and TL-P3-21 (`2026-10-07-tl-p3-21-spine-start.md`);
  - `src/data/spine/plan.ts` (`capturePiles`, `notes: false` at about line 310), `src/data/spine/admission.ts` and `src/data/pile-readiness.ts`;
  - `api/src/process.ts`;
  - `runner/src/main.ts` (`total`), `runner/src/spine/barrier.ts`, `src/data/spine/report.ts` and `src/data/spine/scripted.ts` (`NOTHING_READY`);
  - the `POST /process` row and the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`.
- **Acceptance contract:**
  - **The Worker reads pile notes, transiently.**
    - Admission calls the shared readiness code with notes, so a pile whose note is newer, damaged or whitespace-only is held at admission exactly as the runner would hold it.
    - The manifest and the run row keep only each note's id and version (`modifiedTime` or `version`), never its text.
    - Nothing of the text is logged (`console.*`, errors, causes).
    - A test asserts that the stored row and every log line hold no note text.
  - **Only held piles.** When every pile is held, `/process` answers 409 `nothing` with "Nothing in the inbox is ready yet." before any quota count. That cause already exists in `admission.ts`.
  - **The race.** If every admitted pile is still held when the runner reads it, the run ends `done` with nothing filed, and its report says nothing was ready yet. It is never `failed`, never `B_FAILURE`, and never something "Try again" would repeat. Dispositions say `waiting` for those items.
  - **`total` counts things only.**
    - `total` is the number of things (pile members) on every report, in `last-run.json`, and for a resumed attempt.
    - Journal lines ("your changes") are not counted in it.
    - Check what the app shows ("Reading N things").
  - **Named tests, red first:**
    - api: `admission holds a pile whose note is not ready`, `admission stores no note text`;
    - runner: `a run whose piles are all held ends done with nothing filed`, `total counts things only`.
  - **Files in scope:**
    - `src/data/spine/**`;
    - `api/src/process.ts`;
    - `runner/src/**`;
    - their tests;
    - the contract rows if wording changes.
    - **Not** `scripts/**`: `deploy-staging-hardening` runs in parallel.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full;
  - `pnpm e2e:fake` in full on private port 5196.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
