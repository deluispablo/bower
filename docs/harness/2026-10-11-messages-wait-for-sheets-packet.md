# Packet: messages-wait-for-sheets (toast-over-sheet; ui: true)

- **Entry:** `messages-wait-for-sheets`. Worktree `/private/tmp/bower-messages-wait-for-sheets`, branch `messages-wait-for-sheets`. Not escalated (TL-P4-55): Codex red, Codex implementation, Claude review, then the designer's verified (TL-P4-18 addendum 3). It closes the defect toast-over-sheet, and Q1b integrates after it.
- **Spec:** `docs/design/specs/2026-10-11-messages-wait-for-sheets.md` (owner OK, read-only). Diagnosis: `docs/harness/defects/2026-10-11-toast-over-sheet-diagnosis.md`, option (3).
- **Owned files:** `src/ui/Dock.tsx`, `src/ui/toast.tsx`, `src/ui/back.ts`, `src/ui/Sheet.tsx` (open state only, no visual change), `src/ui/dock.test.tsx`, `src/ui/toast.test.ts`, new `e2e/messages-wait-for-sheets.spec.ts`. Never `src/features/**`, CSS or z-index.

## Contract
One rule in the Dock. While any modal sheet is open, the Dock shows nothing and every message's timer pauses. Messages raised during that time join the stack as usual.
When the last sheet closes, the stack shows again in its usual place with its usual rise. Each timer resumes with its remaining time (4 s, or 8 s with an action). The three-at-most rule still drops the oldest.
Read "a modal is open" from the one overlay home that already tracks open overlays (back.ts `useBackCloses` / the Sheet's open state). Do not add a second registry, per-sheet offsets, a z-index change or a change to any sheet's look.
Keyboard and pointer holds keep working. A message is announced when it shows, which is after the sheet closes. The run chip is not a message: it keeps today's behaviour.
Reduced motion: the message reappears in place.

## Tests (the spec's rows, verbatim)

| Situation | What shows |
| --- | --- |
| A message on screen, then a sheet opens | The message disappears while the sheet is open, and nothing covers the sheet at 375 or 1440. |
| The sheet closes | The message comes back where it was, with the rest of its time. |
| A message raised while a sheet is open (an answer in the tidy sheet) | Nothing over the sheet; the message shows once the sheet closes. |
| "Sign out now?" at 375 after adding a pile | The whole body sentence is readable; no message over it. |
| No sheet open | Messages exactly as d-v2-01. |
| Reduced motion | The message reappears in place. |

Accessibility: axe at WCAG 2.2 with a sheet open and after it closes, on demo and fake, at 375 and 1440.

## Verify
The reds by exact name (prefix `MWS `), `pnpm check`, src/ui component tests, `e2e/v2-dock.spec.ts`, `e2e/v2-name-sheet.spec.ts` and the new spec on demo and fake. Test output to the OS temp folder; read failures only. The designer verifies before closure.

## Commits
Red, fix, notes (`docs/harness/2026-10-11-messages-wait-for-sheets-notes.md`, line 3 `implementer: codex`). The coordinator commits.
