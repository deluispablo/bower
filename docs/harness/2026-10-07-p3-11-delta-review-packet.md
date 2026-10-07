# Packet: P3-11 delta review (report barrier, dispositions, runner wiring)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: the TL-P2-46 and TL-P3-16 fallback at the batch close. A run that claims `done` before its report is saved, repeats an effect, or says nothing happened when something did breaks [ARCHITECTURE](../ARCHITECTURE.md) invariant 6. Counters: read only this packet, the packets below and the diffs, never workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs:** `git diff ca8e94e..<HEAD in your prompt> -- src api runner scripts`. The behaviour is in `76f0c2f`; the stubs and red tests are in `4cce9a4`.
- **Contracts:**
  - [TL-P3-22](2026-10-07-tl-p3-22-report-barrier.md) point 2;
  - the "Runner wire" section of `docs/specs/2026-10-04-worker-contract.md`, with its list of report files;
  - the packet `2026-10-07-p3-11-report-barrier-packet.md`.
- **Look hardest at:**
  - **Barrier order.** Is `.bower/last-run.json` always the last report write? Is it read back by `md5Checksum` before `done` is sent, on every path? Can `done` ever be sent after a failed or unverified read-back?
  - **Before any write**, does the runner check the folder for this `run_id`'s report? Does a finished run's redispatch write nothing?
  - **Failed save.**
    - Does "effects done, report pending" reach the chain before the run reports `saving`?
    - Does a redispatch apply zero effects and write only the report?
    - Is `saving` sent only once every effect has settled, so the "changes were made" sentence is always true?
    - Can a run that fails before its effects ever get that sentence?
  - **Ceiling.**
    - `staleFailure(phase)` in `recovery.ts` and `person.ts`: is only `saving` given the new sentence?
    - Is the old `STALE_FAILURE` unchanged for other phases?
    - Is the sentence plain copy (no jargon, sentence case)?
  - **Dispositions.**
    - Does every admitted item end with exactly one disposition, with none missing and none doubled? This includes waiting items and set-aside items.
    - The delivery says only a declared pile filed whole gets a `pile-disposition` record, and journal lines get none. Is that consistent with `pile-disposition.ts` and TL-P3-22?
  - **Wiring.**
    - Does `runner/src/main.ts` run token → spine → barrier → status in that order?
    - Is the ticket never logged?
    - Are status `seq` values rising and phases forward-only?
    - Does an unexpected error end in a status the Worker accepts?
  - **Extraction.** Does the fake keep its behaviour? `fake-run-records.ts` now re-exports `materialize` and `dispositionsFor`. The app test imports `runner/test/drive-v3.ts`: does that cross-package test import hold under every typecheck?
- **Run:** single test files only (`pnpm exec vitest run <file>`, `pnpm -C api exec vitest run <file>` or `pnpm -C runner exec vitest run <file>`), one at a time. Put reproductions in your own worktree at `/private/tmp/p3-11-review/`, and remove it afterwards.
- **Reply:** the review card in `docs/harness/WORKER.md`.
