# v2-still-marks — d-v2-13 CSS

implementer: codex

tests changed: none

## Changes

Added `e2e/v2-still-marks.spec.ts` first, with the exact test name
`nothing pulses in the running tidy-up`. It uses fake on the phone (375 px)
and desktop (1440 px) projects, reusing qa5/qa10's `running` scenario with
`time=real` so the run remains in progress through the dialog-scoped shared
`expectAxeClean` scan. It checks `Element.getAnimations().length === 0` on
the current step's inner mark and on both desktop live dots.

The phone has no `.live` element: its run chip uses Bower. The test explicitly
expects zero live dots there and tests the current step's mark in its dialog.
Desktop expects two live dots, so their checks cannot pass on missing elements.

Removed the animation declarations from tidy's `.live` and `.now .mark span`.
Both keep their filled `var(--brand)` circles. The current row retains its
`var(--fresh)` background and 600 weight. Removed the verified dead CSS below.
No strings, Bower code, dock, sheet, fade or pop animations changed.

## Grep evidence before deletion

Searched over all `src` with `rg`, first by the names and then by class references
and keyframes to distinguish unrelated prose and identifiers. Full class grep:

```sh
rg -n '(\.skeleton\b|\.shimmer\b|\.ground\b|\.prop\b|\.pc\b|\.paper\b|\.folderProp\b|\.rbBusy\b|\bpulse\b|@keyframes line|animation: line)' src
```

| Candidate | Result before deletion | Action |
| --- | --- | --- |
| ui `.skeleton` | Only `src/ui/ui.module.css:156`; no class caller. A `skeleton` function in `src/data/contracts/note-edit.ts` is unrelated. | Deleted. |
| ui `@keyframes shimmer` | Only ui CSS: the `.skeleton` animation at 156 and keyframes at 157. | Deleted. |
| tidy `.ground` | Tidy CSS:3 has no caller. `TidyScene.tsx:152` uses `s.ground` from `scene.module.css` (import at 6). | Deleted tidy rule; kept scene's used `.ground`. |
| tidy `.prop` | Tidy CSS:4–6 has no caller. `NoteScreen.tsx:254,304,308,312` uses its own `note.module.css` (import at 25; rules at 17–19). | Deleted tidy rules; kept note's used `.prop`. |
| tidy `.pc` | Only tidy CSS:7; no class caller. | Deleted. |
| tidy `.paper` and `i` rules | Only tidy CSS:4–5,8–12; no class caller. | Deleted, including nth-child rules. |
| tidy `@keyframes line` | Only tidy CSS:9 references it; keyframes at 13. | Deleted with unused paper rules. |
| tidy `.folderProp` | Only tidy CSS:4–5,14; no class caller. | Deleted. |
| shell `.rbBusy::after` | Only shell CSS:35; no class caller. | Deleted. |
| `@keyframes pulse` | Tidy CSS:22,48 referenced tidy keyframes at 26; shell CSS:35 referenced shell keyframes at 36. No other `pulse` matches. | Deleted both definitions after removing every reference. |

Post-edit grep over `src` for `pulse`, `shimmer`, `@keyframes line` and
`animation: line` returns no matches. No candidate in the owned CSS files
had a caller; the used scene `.ground` and note `.prop` remain in their own modules.

## Validation and handoff

The owner explicitly prohibited `pnpm check` and all e2e execution. Neither was
run, and no red or green browser result is claimed. The pre-fix CSS had infinite
`pulse` on both tested selectors; the coordinator must execute the red and fix
revisions to record actual assertion results.

- `pnpm exec tsc -p tsconfig.app.json --noEmit`: passed, empty log at `/tmp/v2-still-marks-tsc.log`.
- `pnpm exec eslint e2e/v2-still-marks.spec.ts`: passed, empty log at `/tmp/v2-still-marks-eslint.log`.
- `git diff --check`: passed.

No git writes or pushes were performed. Tests, src and docs are separate files
for the coordinator's three commits. Compatibility placeholders `REDSHA` and
`FIXSHA` must be replaced by the coordinator's red and fix SHAs.

Left out: loading copy (reserved for `c4-resource`), full gates and browser runs.

## Sources

- [d-v2-13 spec block](../design/specs/2026-10-09-v2.md#d-v2-13-nothing-moves-on-its-own-but-bower-1): the brand book says “only Bower moves on its own”; still brand dots, fresh current row, 600 weight.
- [MDN: Element.getAnimations](https://developer.mozilla.org/en-US/docs/Web/API/Element/getAnimations): the element's animations are inspected through the standard browser API. External documentation was not fetched because this task has no network.
