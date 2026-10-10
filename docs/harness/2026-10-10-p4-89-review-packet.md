# Packet: P4-89 review (e2e-resize-helper, written by Codex; lead ruling (b) on empty-note-help-flaky)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-e2e-resize-helper`.

## What to review

- **Diff:** `git diff claude/p3...e2e-resize-helper`: new `e2e/viewport.ts`, `src/e2e-viewport.test.ts` (guard), `eslint.config.js`, 15 specs, notes.
- **Contract:** the diagnosis `docs/harness/defects/2026-10-10-empty-note-help-flaky-diagnosis.md`, option (b); the lead's ruling: one resize() helper that waits for the target shell's landmark, used at the 4 sites, at v2-name-sheet.spec.ts:28 and at every other cross-breakpoint resize. Guard: the failing spec passes 20/20 on fake phone.
- **Coordinator evidence:** the 15 specs pass on demo (122) and fake (124); empty-note-help on fake phone ×20 passes 40/40 (/tmp/erh-*.log).

## Look hardest at

- The helper waits with web-first assertions for the target shell's landmark and for the other shell's copy to be gone; no fixed sleeps; the breakpoint is the one in src/ui/media.ts (pinned, not copied loosely).
- No spec's assertion changed meaning; same-side resizes left alone are truly same-side; no cross-breakpoint setViewportSize remains outside viewport.ts.
- The guard (lint rule plus test) fails on a new raw cross-breakpoint resize and is not fragile.
- Every changed test has its `tests changed:` line in the notes.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
