# Packet: P4-57 review (v2-still-marks, d-v2-13 CSS part; Codex-written)

The review is read-only and fresh. Run unit tests only; never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-v2-still`.

## What to review

- **Diff:** `git diff 7257306dd1a4b7760dfda6e7cf4926e284be402e..v2-still-marks`. Red c5ca3e44, fix 0be6c48d, notes 00ae473c.
- **Packet:** `docs/harness/2026-10-09-d-v2-13-css-packet.md`, signed off by the designer.
- **Gates**, run by the coordinator under the lock: `pnpm check` is green. e2e v2-still-marks, qa5, qa10, app and focus-after-close on phone and desktop: 240 passed.

## Look hardest at

- **Stillness.** `.live` and `.now .mark span` are still, filled `--brand` circles. The current step keeps its `--fresh` row at weight 600.
- **Dead CSS.** Each deleted class must really be unused: `.skeleton`/`shimmer`, `.rbBusy`, the tidy `.ground`/`.prop`/`.pc`/`.paper`/`line`/`.folderProp`, and `pulse`.
  - Grep the TSX for `s.<name>` against the right module. The notes say scene.module.css `.ground` and note.module.css `.prop` were kept; that is correct, since they are other modules.
- **No other animation changed** (dock, sheet, fade, pop) and no strings changed.
- **The red** really holds a tidy-up in its running state and asserts that `getAnimations()` is empty. Axe runs through `e2e/axe.ts`, scoped.
- **Housekeeping:** `tests changed:` lines, compatibility rows, and no `.only` or `.skip`.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
