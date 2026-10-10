# Packet: folder-header-wrap (DEFECTS folder-table-header-wrap; Codex, UI, non-escalated)

- **Entry:** `folder-header-wrap` (ui: true). Worktree `/private/tmp/bower-folder-header-wrap`, branch `folder-header-wrap` from `claude/p3`.
- **Ruling:** DECISIONS "DEFECTS folder-table-header-wrap" (the lead verified the cause; no separate diagnosis).
- **Starting model:** Codex. Then a fresh Claude review and the designer's check.

## Cause

The folder table's header buttons (`src/features/files/folder.module.css:32`) inherit body's `overflow-wrap: anywhere` (`src/styles/base.css:60`). The cells are `nowrap` (:33), the headers are not, so the table squeezes columns to one letter before `.tableWrap` (`overflow-x: auto`) scrolls.

## Contract

1. One home: `.table th { white-space: nowrap }` in `folder.module.css` only (add it to the existing `.table th` rule). `base.css` is not touched. The note table (`markdown.tsx:103`) is not touched.
2. No other product change.

## Red (e2e, demo, in an existing folder spec or a new `e2e/folder-table.spec.ts`)

Open the demo "Flat hunt" folder table at 375×812 and 1280×800:
- every header button is one line: height ≤ 48 px;
- the Bedrooms and Commute header cells are no narrower than their labels' natural width (compare the cell's `getBoundingClientRect().width` with the label text's `scrollWidth`, or a `Range` over the text);
- at 375 the table wrap scrolls sideways (`scrollWidth > clientWidth`).
It must fail on claude/p3 and pass with the fix. Run it on both projects as the config defines (desktop, phone) and on demo; axe as the folder specs already do.

## Commits

1. The red. 2. The fix. 3. The notes (`docs/harness/2026-10-10-folder-header-wrap-notes.md`).
