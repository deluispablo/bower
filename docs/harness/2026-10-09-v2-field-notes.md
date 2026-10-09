# v2-field notes (d-v2-08)

- **Research.**
  - WCAG 2.2 1.4.11 Non-text Contrast: the edge that identifies a control needs 3:1 against adjacent colours (https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
  - WAI-ARIA error pattern: `aria-invalid="true"` on the field, `aria-describedby` pointing at the message (https://www.w3.org/WAI/ARIA/apg/ and the aria-invalid / aria-describedby entries of WAI-ARIA 1.2).
  - No library queried; plain CSS and React.
- **One home.** `src/ui/Field.tsx` and `.field`, `.fieldBox`, `.switch`, `.check` in `src/ui/ui.module.css`. `Input` and `Textarea` set `aria-invalid` and `aria-describedby` (the error id joins any always-on id); `FieldError` is the message (13 px, `--danger`). `fieldBox()` is for a wrapper holding an icon and a typing part, so the wrapper draws the edge.
- **Task box.** A native checkbox with `appearance: none`, drawn 24 x 24 with a 2 px inset ring; keyboard, name and checked state stay the browser's.
- **Token.** `control-line` in `tokens.json`, `pnpm tokens` run. Only `scripts/tokens-to-css.mjs` consumes it.
- **Border width.** Chrome snaps a 1.5 px border to whole device pixels, so it computes as 1 px at 1x; the e2e compares to a plain 1.5 px probe.
- **Port.** Playwright's `reuseExistingServer` on 5191 picked up another worktree's server; e2e was run with an untracked config on port 5291 (deleted).
- **Left out.**
  - NameSheet width and layout, FolderScreen's New note form layout (d-v2-09). Its input uses the shared field only because its own CSS went.
  - The tree's inline rename input (`Explorer.tsx` `RenameInput`) and the demo panel inputs are not on the packet's list.
  - NameSheet has no inline error message today (the slash note is a toast), so it has no error edge.
  - The Home search kbd hint and the Bower composer's font (17 px now, was 18).
- tests changed: none.

## Addendum: fix round (TL-P4-22 addendum 3)

- Checkbox class renamed `.check` to `.taskBox` (ui.module.css, Field.tsx); the menu `.check` indicator is as before v2-field.
- Invalid focused field: a later rule at equal specificity keeps `--danger` over the focus edge; the focus ring is untouched. No `!important`.
- tests changed: e2e/v2-field.spec.ts: two tests added (sort menu tick, focused invalid field); no existing test changed.
- review: skipped (TL-P4-22)
