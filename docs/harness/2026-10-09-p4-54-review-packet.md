# Packet: P4-54 review (c4-new-pill-one; Codex-written, TL-P4-23)

This review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-pill`.

## What to review

- **Diff:** `git diff 892bf176861675d38c8fc00cc44de139cfae7518..c4-new-pill-one`. Red 588023ab, fix 01fc4694, notes 5b35c9d9, and the test scope correction 75a1a4ce (axe scoped to `main`).
- **Packet:** `docs/harness/2026-10-09-c4-new-pill-one-packet.md`, signed off by the designer with the `.newtag` shape.
- **Gates**, run by the coordinator under the lock:
  - `pnpm check` is green;
  - e2e c4-new-pill-one, v2-move-here, qa5 and qa7 on phone and desktop: all passed.

## Look hardest at

- **One home.** `src/ui/ui.module.css` `.freshPill`: a 22 px fixed height, `0 9px`, inline-flex, `--fresh`/`--brand-line`, 13px, 600.
  - The three feature `.new` rules keep only their placement.
  - MovePicker drops `folder.module.css`.
  - Is a class in `ui.module.css` how `src/ui` already exposes similar marks? It must not be a second way beside an existing component.
- **The source check** in `src/ui/pill.test.ts`: does it catch a future copy without false positives?
- **The e2e scope change** to `main`. Does any pill under test sit outside `main`?
  - The Move sheet is a dialog: is it still scanned?
  - The desktop right-panel `heading-order` is owned by d-v2-17.
- **Housekeeping:** the `tests changed:` lines, no `.only`/`.skip`, and the compatibility rows for the red and the fix.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
