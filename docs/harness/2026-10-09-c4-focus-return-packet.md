# Packet: c4-focus-return with d-v2-04 (stage 4, first pair)

- **Entry:** `c4-focus-return`, set to `ui: true` (TL-P4-21 ruling 1). Worktree `/private/tmp/bower-c4-focus`, branch `c4-focus-return` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-21, rulings 1 and 2, order 1;
  - the defect `qa10-toast-flake`, ruling (b) ([doc](defects/2026-10-09-qa10-toast-flake.md));
  - V2 spec block d-v2-04 ([spec](../design/specs/2026-10-09-v2.md#d-v2-04-closing-a-dialog-returns-focus-to-what-opened-it-2));
  - impact note, finding 1 and block d-v2-04 ([impact](impact/2026-10-09-v2.md));
  - TL-P4-18 addenda 2-3: the designer verifies the change before close.
- **Starting model:** `bower-implementer` (Sonnet).

## Today (verified by the lead and the impact note)

- `ui/Sheet.tsx:30` passes `onCloseAutoFocus={focusMain}`. No sheet has a `Dialog.Trigger`, so every `Sheet` sends focus to `#main`. That covers 8 uses: TidySheet, ConfirmBin, NameSheet, MovePicker, Settings' delete, FolderScreen's New note and Explorer's two sheets.
- `ui/focus.ts`: `focusMain` uses a 0 ms timer (:5-10). `returnFocusTo` uses a 3000 ms timer (:31-52) and already falls back to the heading when the opener has gone.
- Other opener trackers:
  - Palette: `features/palette/Palette.tsx:107-113`. Its pattern, preventDefault then return, is the shape to generalise.
  - Replay: `features/tidy/Replay.tsx:122,146`.
  - Toasts: `ui/toast.tsx:70-85`.
  - Explorer: `Explorer.tsx:125,130,532-547`.

## Contract

1. **One focus home** in `src/ui/focus.ts`, built on the components' close-focus hooks (Radix `onCloseAutoFocus`, preventDefault), with no timers.
   - `Sheet.tsx` records the opener (`document.activeElement` on open) and returns focus to it through the one helper, for all 8 sheet uses.
   - The 7 same-class sites use it too.
2. **Opener gone.** When the opener has left the DOM, focus falls back to the route heading, as today.
3. **Second-way risks (impact note):** do not fix `TidySheet` alone with its own opener ref, and keep no per-site timer.
4. **Mechanism map.** `docs/ARCHITECTURE.md` gets the row "Focus return after a menu, sheet, toast or palette closes" → `ui/focus.ts`.
5. **Timers.** The five `focusRouteHeading` names in `harness/real-timers.json` belong to `c4-test-timers`. Remove a name only if your change makes its test timer-free, and never add one.

## What the person sees (TL-P4-22; the designer signs this off before dispatch)

No new or changed strings. Only where focus lands changes. Every case is checked at 375 and 1440, dark and light, by keyboard.

| Screen and state | Action | Focus lands on |
| --- | --- | --- |
| Home, "Tidy up 15 things?" sheet open (opened from Home's "Tidy up N things" button) | Escape, or "Not now" | That Home button |
| Desktop, the same sheet opened from the tab-bar button | Escape, or "Not now" | That tab-bar button |
| Any other sheet: ConfirmBin, NameSheet (Rename, New note, New folder), MovePicker, Settings' delete, FolderScreen's New note, Explorer's two sheets | Close | The control that opened it |
| A sheet whose opener has gone, for example the row was binned by the action | Close | The route heading, as today |
| Explorer's tree menu on a folder | Escape, then Delete at once | The folder row. The Delete question shows ("Move … to the Bin?" with today's wording, unchanged) |
| Palette, Replay, toasts | Close | As today: the opener, or the heading |

The focus ring is the standard `:focus-visible` ring. No visual change otherwise.

**Signed off** by the designer on 2026-10-09 (ff649f4f). Not in this entry: after a Bin, moving focus to the next row is a later idea (APG).

## Red

- d-v2-04: press Enter on Home's "Tidy up 15 things", then Escape. `document.activeElement` must be that button; today it is `MAIN#main`.
- The same with "Not now", and from the desktop tab-bar button.
- qa10: open the tree menu on a folder, press Escape, then Delete at once. The Delete question must show.

## Verify (exact names)

- `focus returns on close with no timer` (unit)
- e2e:fake, both projects:
  - `Delete on a folder asks before the Bin`
  - `closing the tidy sheet returns focus to its opener`
  - `closing the tidy sheet with not now returns focus to its opener`
- Each e2e waits for focus, never for time. axe runs on the touched screens with the WCAG 2.2 tags and `target-size` enabled.
- `e2e/focus-after-close.spec.ts` (F1, F2) and `ui/focus.test.ts` may change. Each change needs a `tests changed:` line.
- `pnpm check` must be green.

## Commits

The red (tests only), then the fix, then the notes in their own commit (`docs/harness/2026-10-09-c4-focus-return-notes.md`). The card carries `worktree: <path>`.

Reviewers are read-only. They never move the main checkout in any form.
