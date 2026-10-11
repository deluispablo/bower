# Packet: P4-109 review (q1c-live-questions, the delta since P4-108)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-q1c-live-questions`.

## What to review

- **Diff:** `git diff 67616500..HEAD -- src runner api`. Reds: 093e4474 and 2442e8a3, plus the console-count repair c7fb95ba. Fixes: after 093e4474, and 94ce85e5. Notes: "Addendum 8 reds" through "Addendum 8 red repair".
- **Contract:** TL-P4-44 addendum 8 (DECISIONS).
  - Live publication never fails a run.
  - Any display bound (count, length, shape, 64 KiB) trims the live snapshot, with one console line.
  - The question is still stored, and the Drive copy shows it at the end.
  - A publication transport failure is logged and the run continues.
  - There is no second bound in the scripted asker.
- **Prior:** P4-108 BLOCK (`docs/harness/2026-10-11-p4-108-review.md`); Codex pass 3 BLOCK and pass 4 PASS.
- **Gates (coordinator):** pnpm check green; api 280/280; e2e app/capabilities demo 35 / fake 59.

## Look hardest at

- No publication path can fail a run. Ordinary status reports keep their failure meaning.
- Trimming keeps the order and logs once. Stored questions are complete.
- The Worker stays strict.
- The console-count repair only narrows the count to the publication's own line.
- You may run `pnpm -C runner exec vitest run test/q1c-live.test.ts --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to the path the coordinator names.
