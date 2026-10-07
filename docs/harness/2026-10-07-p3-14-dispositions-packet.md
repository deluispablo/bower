# Packet: dispositions-match-report (P3-14)

Starting model: `bower-escalated` (Opus). Reason: a run's recorded outcome must be true ([TL-P3-22](2026-10-07-tl-p3-22-report-barrier.md) point 2, I3; TL-P3-24 point 1). On the first real inbox run on staging, `dispositions.json` said `set-aside` for the one inbox pile's file. The report said `filed`: the note was written into Resources/Ideas and its pile moved to the Bin.

- **Entry:** `dispositions-match-report`. Checkout `/private/tmp/bower-p3-disp`, branch `claude/p3-disp`, from the commit named in your prompt. Never push or deploy, and never run `gh` or `wrangler`.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, and TL-P3-22 with its addendum.
  - `src/data/spine/report.ts` (`itemDispositions`), `src/data/spine/barrier.ts` and `src/data/spine/scripted.ts`.
  - `src/data/contracts/pile-disposition.ts`, read only.
  - The runner's barrier tests in `runner/test/barrier.test.ts`, read only.
- **Acceptance contract:**
  - **Filed means filed.**
    - `itemDispositions` decides `filed` from what the run actually did: the applied outcomes and the report.
    - It must cover a pile that is written into a new note and binned, not only a pile moved whole. The likely cause is `whole(pile.pileId)` or `filed.has(item.fileId)` missing the "written from a note you added" path. Confirm it with a test first.
    - `set-aside` applies only to what the report lists under `setAside`. `waiting` applies only to what changed since admission.
  - **Never contradict the report.**
    - A check in `src/data/spine/` asserts that every `filed` and `setAside` row in the report has a matching disposition, and that no disposition contradicts the report.
    - The barrier runs that check before it writes `dispositions.json`. On a contradiction the run stops with an internal failure and does not write `last-run.json`. Say in your card exactly what the runner then reports.
  - **Named tests, red first** (commit them on their own before the fix):
    - `a pile written into a new note is filed in its dispositions`: the scripted provider runs on a one-note inbox pile, and `dispositions.json` says `filed` for its file.
    - `dispositions never contradict the report`.
  - **Files in scope:**
    - `src/data/spine/report.ts`, `src/data/spine/barrier.ts` and their tests in `src/data/spine/`;
    - `runner/test/**` only if a runner test must change.
    - **Not** `runner/src/main.ts` or `runner/src/status.ts`: `runner-reports-reading-total` owns those, in parallel in `/private/tmp/bower-p3-reading`.
- **Gates:**
  - the verify, red first on assertions;
  - `pnpm check` in full;
  - `pnpm e2e:fake` in full on private port 5197 (5196 belongs to the other worker, and 5198 to a preview that is not yours).
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the implementer delivery card in `docs/harness/WORKER.md`.
