# Packet: P4-72 review (folder-header-wrap, written by Codex; DEFECTS folder-table-header-wrap)

This review is read-only and fresh. Do not run e2e, start a server or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-folder-header-wrap`.

## What to review

- **Diff:** `git diff claude/p3...folder-header-wrap`: the red e2e, the CSS fix, the notes and the compatibility row.
- **Packet:** `docs/harness/2026-10-10-folder-header-wrap-packet.md`. Ruling: DECISIONS "DEFECTS folder-table-header-wrap".

## Look hardest at

- **One home:** only `.table th` in `folder.module.css` changed; base.css and markdown.tsx untouched.
- **The red proves the ruling:** each header ≤ 48 px tall at 375 and 1280; Bedrooms and Commute no narrower than their labels (is the natural-width measurement sound, or could it pass with a wrapped label?); the wrap scrolls sideways at 375; axe with WCAG 2.2.
- **No fixed waits,** no `.only`/`.skip`, no loosened bound.

Already run by the coordinator: the red failed without the fix on both projects (`375: Bedrooms header height`); with the fix, demo and fake pass; pnpm check green.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
