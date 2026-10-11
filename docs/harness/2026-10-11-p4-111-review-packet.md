# Packet: P4-111 review (b3b-hot-maintain, the delta since P4-110)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b3b-hot-maintain`.

## What to review

- **Diff:** `git diff 17d80515..HEAD -- src runner docs/ARCHITECTURE.md`. This is the delta since the P4-110 BLOCK (`docs/harness/2026-10-11-p4-110-review.md`). It holds:
  - addendum 6 (reds 30ae6d41 and dde8870d; fix 4282aa78);
  - the new `src/data/contracts/op-key.ts`;
  - fix 3 (red ec272cdf, its repair 68fe6d66, fix 89a50304).
  Notes: "Addendum 6" through "Fix round 3".
- **Contract:** TL-P4-42 addendum 6 and TL-P4-50 (the op key), plus the lead's op-key direction:
  - `src/data/contracts/op-key.ts` is the first 12 hex of sha256 over the canonical [rootId, runId, operationId], on hashes.ts;
  - there is one ARCHITECTURE mechanism-map row;
  - B8 reuses it.
- **Prior:** Codex passes 3 (BLOCK) and 4 (PASS).
- **Gates (coordinator):** pnpm check green (517/528); runner tsc clean; e2e app/capabilities demo 35 / fake 59.

## Look hardest at

- Every Recent changes row ends ` · op:<key>`. Rows dedupe by key.
- An Undo run's inverse lines drop the rows they undo, across runs, with zero archive reads.
- A whole-run Undo shows as its own row. An ordinary inverse keeps its own wording.
- op-key is pure, the single home, and contract-import-clean.
- One date validator. Goldens unchanged since P4-110.
- The red repairs only switch to opKey or seed through contracts.
- You may run `pnpm -C runner exec vitest run test/b23-hot-context.test.ts test/b23-hot.test.ts --maxWorkers=2` and `pnpm exec vitest run src/data/contracts/op-key.test.ts`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to the path the coordinator names.
