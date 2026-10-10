# Packet: P4-66 review (c4-sheet-settle, written by Codex; defect move-sheet-cancel-width-flaky)

This review is read-only and fresh. Do not run e2e, start a server or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-sheet-settle`.

## What to review

- **Diff:** `git diff claude/p3...c4-sheet-settle`: specs 82856c72, notes b7f0b971.
- **Packet:** `docs/harness/2026-10-10-c4-sheet-settle-packet.md`. **Diagnosis:** `docs/harness/defects/2026-10-10-move-sheet-cancel-width-flaky.md`. **Ruling:** DEFECTS move-sheet-cancel-width-flaky (proposal (a)).

## Look hardest at

- **Every geometry read waits for the shared `animationsEnd(page)`.** Check v2-move-here, v2-name-sheet (:48-51, :78-82, :105-111) and qa5, which Codex also touched. Did any spec that measures a sheet right after it opens get missed?
- **Axe scans** go through `expectAxeClean`, with the same scope and tags as before.
- **No bound, assertion or retry changed.** No product file is touched.
- **`tests changed:` lines** cover every touched test.

Already run by the coordinator: both specs on desktop with `--repeat-each=3` (6/6), and on fake for both projects (24/24).

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
