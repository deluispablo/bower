# Packet: focus-note-link-and-sign-out (TL-P2-47 fix round)

Starting model: `bower-implementer` (Sonnet). Reason: a small UI fix with a clear failing test, extending the `focus-after-replay-and-route` mechanism; no contract or data change.

- **Entry:** `focus-note-link-and-sign-out` in `harness/features.json` (query it with `jq`). Findings G1, G2: the "Important" section of [2026-10-06-p2-supplemental-walk-3e6e7da.md](2026-10-06-p2-supplemental-walk-3e6e7da.md).
- **Checkout:** `/private/tmp/bower-p2-focus2`, branch `claude/p2-focus2`. Never push.
- **Standard (lead, TL-P2-47 and the earlier round):** after a client-side route change, focus moves to the new view's `h1` with `tabindex="-1"` (Fable Tech Labs/Gatsby routing study; GOV.UK). Reuse `src/ui/focus.ts` (`focusHeading`) and the route-change rescue in `src/app/Shell.tsx`; find why it misses these two cases (likely: the note view stays mounted so the focused link is not removed, or the h1 renders after the 50 ms wait; and `/sign-in` renders outside `Shell`) before adding anything.
- **Acceptance contract:**
  - Named tests, appended to `e2e/focus-after-close.spec.ts` (demo source, phone and desktop): `G1: a link from one note to another moves the keyboard to the new note` (open `/note/Projects/Flat%20hunt/Flat%20hunt.md`, focus the Timeline link "Flat 9, Wrenfield Road", Enter, expect that note's `main h1` focused) and `G2: signing out moves the keyboard to the sign-in page` (`/settings`, focus "Sign out", Enter, expect the sign-in page's h1 focused). See each fail on the assertion first.
  - Observable: both cases end on the new view's h1, never BODY. F1, F2, top-bar links, the tree and the footer replay button keep their current behaviour (their tests stay green).
  - Files in scope: `src/app/Shell.tsx`, `src/ui/focus.ts` and its test, the note screen under `src/features/` if needed, the sign-in screen and `src/app/App.tsx` if needed, `e2e/focus-after-close.spec.ts`. Anything else goes in "left out".
- **Gates:** the verify, `pnpm check`, and the e2e of touched screens on both sources (`e2e`, `E2E_SOURCE=fake`). Playwright on a private config on port 5195. The quiet-gates hook filters plain gate commands.
- **Deliver, under 15 lines:** commit SHAs, files, red→green evidence, gate results, sources, left out.
