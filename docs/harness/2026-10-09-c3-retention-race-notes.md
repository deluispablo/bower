# c3-retention-race: implementer notes

- Red `bf1a72d6` (tests only), fix in the next commit. Live evidence P4-38e.
- Change: `runner/src/spine/retention.ts` `clean()` now judges one picked folder; `keepFinishedAtEnd` lists each pick
  just before its own Bin (list 1, Bin 1, list 2, Bin 2, ...). Same calls, new order; the window between a pick's
  listing and its Bin is one call, not about three.
- Unchanged: only marked folders are binned; a folder holding an unmarked child is kept and logged; at most 3 Bins per
  run; the 24 h rule; a list failure keeps that folder, a Bin failure is logged and stops the rest, never failing the run.
  `fencedWrites()` is a local wrap (no Drive call), so making it before the listings adds no call.
- Goldens: C04 78 and 25-runs 88 unchanged (drive-calls-golden passes in `pnpm check`).
- Tests (`runner/test/checkpoints.test.ts`, through `keepFinishedAtEnd` as `main.ts` calls it at the run end):
  - "each run folder is listed just before its own Bin": wire order of list/PATCH for run-00..02.
  - "a picked folder that gains an unmarked child before its turn is kept": the fault hook's `applied` on run-00's trash
    adds Ideas.md to run-01; run-01 kept, run-00 and run-02 binned. Red: run-01 was binned with the note.
  - `keptAt` gained an optional fault hook and returns the wire requests.
- Sources: Drive `files.update` with `trashed: true` (https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update)
  takes no precondition on a folder's children; Drive has no conditional trash (no If-Match / ETag on v3 writes,
  https://developers.google.com/workspace/drive/api/guides/performance#etags is v2 only), so the honest fix is to shrink
  the window, not close it.
- Removed: the batch listing loop of all picks before any Bin (old `clean` over `picked[]`).
