# Messages wait while a sheet is open (toast-over-sheet, owner OK 2026-10-11)

The V2 spec (2026-10-09-v2.md, d-v2-01, "Messages sit above the tab bar, full width, never over the work") places messages over the page, but says nothing about a sheet being open. Today the Dock (src/ui/Dock.tsx, `.dock` z-index 60) draws above the sheet scrim (50) and the sheet (51). On the phone it lands inside the bottom sheet and hides its words; on desktop it covers the bottom of a tall sheet. The owner chose this rule, which is option (3) in the diagnosis. Severity (NN/g): major.

## The rule (one home: the Dock)

- **While any modal sheet is open,** the Dock shows nothing, and every message's timer pauses. Messages raised during that time join the stack in the same way.
- **When the last sheet closes,** the stack shows again, in its usual place and with its usual rise, and each timer resumes from where it paused (4 s, or 8 s with an action). The three-at-most rule still drops the oldest.
- **Why hide, not move:** a modal sheet makes everything outside it inert (WAI-ARIA APG, dialog modal). A message drawn outside the sheet can't be pressed or read by a screen reader anyway, so it waits for the moment it can be used.
- **One rule:** the Dock reads whether a modal is open from the one overlay home that already tracks it (`afterOverlaysClosed` / the Sheet's open state). No per-sheet offsets, no new z-index, and no change to any sheet.
- **Unchanged:** the placement, size, stacking, motion and words of d-v2-01. The run chip is not a message, so it keeps today's behaviour.

## Effect on the questions UI (Q-UI-2)

An answer given inside the tidy sheet still raises today's toast: `waits` mid-run, `answeredNow` on the done sheet. Under this rule it shows when the sheet closes. In the sheet, the card going away (and focus moving on) is the immediate feedback.

## What the person sees: rows to test

| Situation | What shows |
| --- | --- |
| A message on screen, then a sheet opens | The message disappears while the sheet is open, and nothing covers the sheet at 375 or 1440. |
| The sheet closes | The message comes back where it was, with the rest of its time. |
| A message raised while a sheet is open (an answer in the tidy sheet) | Nothing over the sheet; the message shows once the sheet closes. |
| "Sign out now?" at 375 after adding a pile | The whole body sentence is readable; no message over it. |
| No sheet open | Messages exactly as d-v2-01. |
| Reduced motion | The message reappears in place. |

Accessibility: a message is announced when it shows, which is after the sheet closes. Axe at WCAG 2.2 with a sheet open and after it closes, on demo and fake, at 375 and 1440.
