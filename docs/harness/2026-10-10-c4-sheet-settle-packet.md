# Packet: c4-sheet-settle (defect move-sheet-cancel-width-flaky; Codex, non-escalated)

- **Entry:** `c4-sheet-settle`. Worktree `/private/tmp/bower-c4-sheet-settle`, branch `c4-sheet-settle` from `claude/p3`.
- **Ruling:** DEFECTS move-sheet-cancel-width-flaky (lead, 2026-10-10, main): proposal (a). Diagnosis: `docs/harness/defects/2026-10-10-move-sheet-cancel-width-flaky.md`.
- **Starting model:** Codex. Afterwards a fresh Claude review, and three clean e2e runs of both specs on desktop.

## Contract

1. `e2e/v2-move-here.spec.ts` and `e2e/v2-name-sheet.spec.ts` (:48-51, :78-82, :105-111) call the shared `animationsEnd(page)` from `e2e/axe.ts` before every geometry read (boundingBox and the like).
2. Their axe scans go through `expectAxeClean`, never a direct AxeBuilder.
3. Every bound and assertion stays unchanged. No retry and no product change.
4. Any other spec that measures boxes right after opening an animated sheet gets the same treatment. List each one in the notes.

## Red

This is a flaky-test fix with no deterministic red. The proof is three clean desktop runs of both specs (`--repeat-each=3`), run by the coordinator under the lock. The notes say "red: none (flaky timing); proof: repeat runs".

## Commits

1. The specs.
2. The notes (`docs/harness/2026-10-10-c4-sheet-settle-notes.md`), with `tests changed:` lines for every touched test.
