# Packet: v2-field, d-v2-08 (stage 4, first pair)

- **Entry:** `v2-field` (`ui: true`). Worktree `/private/tmp/bower-v2-field`, branch `v2-field` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-21 rulings 1 and 2 (order 1);
  - V2 spec block d-v2-08 ([spec](../design/specs/2026-10-09-v2.md#d-v2-08-fields-and-checkboxes-show-their-edge-2-wcag-1411));
  - impact note finding 3 and block d-v2-08 ([impact](impact/2026-10-09-v2.md));
  - AGENTS brand-token rule (`tokens.json`, then `pnpm tokens`);
  - TL-P4-18 addenda 2-3: the designer verifies before close.
- **Starting model:** `bower-implementer` (Sonnet).

## Today (impact note, verified by the lead)

- `--line-strong` does not exist. Every field has its own CSS, in seven modules, with an inset `--line` ring (about 1.2:1) or no ring.
  - `features/piles/piles.module.css:7,13,30`: Add's "What is this?", the link field and the pile note.
  - `features/files/folder.module.css:46`: `.nameForm input`.
  - `features/files/files.module.css:2-3`: Move's search.
  - `features/bower/bower.module.css:5,9`: Tell Bower's box.
  - `features/home/home.module.css:32`: Home's search.
  - The side panel's search, `features/files/SearchPanel.tsx`.
  - The switch: `features/settings/settings.module.css:9-12` and `Settings.tsx:27-48`.
  - The task box: `features/note/markdown.tsx:77`, a native checkbox with `accent-color` (`note.module.css:68`).
- There is no shared field in `src/ui/`, so "one field rule" is a new home.

## Contract (spec d-v2-08, exact values)

1. **Token.** `control-line` in `tokens.json`: dark `rgba(223,229,238,0.44)`, light `#8a857c`. Its usage line reads "The edge of a control you type in or toggle. 3:1 on every ground." Then run `pnpm tokens`. Check by grep that nothing else consumes `tokens.json`.
2. **One field rule** in `src/ui/`: a `field` class in `ui/ui.module.css`, modelled on `.btn`. Add a small `Field`/`Switch`/`Checkbox` set only if markup must be shared.
   - Fields: a 1.5 px `control-line` border, `radius 14px` (the search field 999px), at least 48 px tall, and a placeholder in `--text-muted`.
   - Focus: the standard ring (`base.css:83-86`), and the border turns `--text-muted`.
   - Error: a `--danger` border, with the message under the field in `--danger` at 13 px.
   - Unticked task box: a 2 px `control-line` inset ring, 24 × 24, `radius 7px`. This must be a custom-drawn box, since a native checkbox cannot take an inset ring. It keeps the box's keyboard and screen-reader behaviour.
   - Switch, off: a 1.5 px `control-line` inset ring.
3. **Every listed screen** drops its own field CSS and uses the rule.
   - Second-way risk (impact note): do not fix the edge in seven module files.
   - Out of scope: NameSheet's width and layout (d-v2-09) and FolderScreen's second New-note form (d-v2-09's own risk).
4. **Copy:** none.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

There are no new strings. Existing placeholders and error messages keep their wording; only their drawing changes. Check every case at 375 and 1440, in dark and light.

| Control (screen) | Default | Focus | Error | Placeholder |
| --- | --- | --- | --- | --- |
| "What is this?" (Add) | 1.5 px `control-line` border, radius 14, at least 48 px tall | standard ring, border `--text-muted` | `--danger` border; the message under the field in `--danger`, 13 px | `--text-muted` |
| Link field "Paste a link" (Add) | same | same | same (today's invalid-link message) | `--text-muted` |
| Pile note (Add) | same | same | — | `--text-muted` |
| Tell Bower's box (Bower) | same edge on the box (no separate composer ring) | same | — | `--text-muted` |
| Rename, New note, New folder input (NameSheet) | same edge only; width and layout belong to d-v2-09 | same | same (today's slash and name messages) | `--text-muted` |
| Move's "Find a folder" (MovePicker) | same, radius 14 | same | — | `--text-muted` |
| Search on Home (a button that opens the palette) and in the side panel | same edge, radius 999, at least 48 px tall | same | — | `--text-muted` |
| Switch, off (Settings) | 1.5 px `control-line` inset ring | standard ring | — | — |
| Switch, on (Settings) | unchanged | standard ring | — | — |
| Unticked task box (note) | custom box 24 × 24, radius 7, 2 px `control-line` inset ring; same keyboard (Space) and the same accessible name and checked state | standard ring | — | — |
| Ticked task box (note) | unchanged look of the ticked state | standard ring | — | — |

**Errors, for every field that has one:** the field gets `aria-invalid="true"` and is linked to its message with `aria-describedby`. Both live in the one field rule, not per screen. Today's wording stays.

**Signed off** by the designer on 2026-10-09 (ff649f4f, with the two additions above). At the design check, the designer measures each edge at 3:1 or more on bg, bg-alt and surface, in both themes, at 375 and 1440.

## Red

`every control edge is at least 3:1 on its ground`: a unit test that reads `tokens.json` and checks `control-line` against `bg`, `bg-alt` and `surface` in both themes. It fails today, because the token is missing.

## Verify (exact names)

- `every control edge is at least 3:1 on its ground` (unit).
- e2e:fake `fields and switches draw their edge with the control line`, on both projects, dark and light. It checks the computed border colour of each listed field, switch and task box, and that placeholders use `--text-muted`.
- axe passes on the touched screens, with the WCAG 2.2 tags and `target-size`.
- `pnpm check` is green.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-v2-field-notes.md`), with `tests changed:` lines. The card carries `worktree: <path>`.

Reviewers are read-only. They never move the main checkout in any form.
