# Packet: focus-after-replay-and-route (the one P2 C/I round)

Starting model: Sonnet (`bower-implementer`). Reason: a small UI fix with a clear failing test; no contract or data change.

- **Entry:** `focus-after-replay-and-route` in `harness/features.json` (read only that entry). Findings F1, F2 in [2026-10-06-p2-evaluation-4d7ab08.md](2026-10-06-p2-evaluation-4d7ab08.md) (read only the "Important" section).
- **Checkout:** `/private/tmp/bower-p2-focus`, branch `claude/p2-focus`, from integration `codex/close-phase-2`. Never push.
- **Research first:** cite the standard. Route changes in single-page apps: move focus to the new page's main heading or main region (e.g. GOV.UK / Fable Tech Labs "focus on route change", WAI-ARIA APG dialog pattern: on close, return focus to the opener or, if it is gone, a logical element). Reuse `src/ui/focus.ts` `focusMain()` and the `Replay.tsx` close path (lines ~119–145) before adding a mechanism.
- **Acceptance contract:**
  - Named tests, new file `e2e/focus-after-close.spec.ts` (demo source, desktop): `F1: closing the replay from the Home card keeps the keyboard on the page` and `F2: a button that changes the page moves the keyboard to the new page`. Each asserts `document.activeElement` is not `BODY` and is the expected element. See them fail on the assertion first.
  - Observable: F1 for Escape and Skip; F2 for "Add a pile" and "Put the note in the inbox". Top-bar links and the footer "Watch the last tidy-up" keep their current behaviour.
  - Files in scope: `src/features/tidy/Replay.tsx`, `src/features/home/Home.tsx`, `src/ui/focus.ts`, the app shell/router file that renders routes (find it), the piles add screen if needed, `e2e/focus-after-close.spec.ts`, and their unit tests. Anything else goes in "left out".
- **Gates:** the verify above, `pnpm check`, `pnpm exec playwright test e2e/<touched screens>`; Playwright on a private config on port 5195 (never 5191/5192). Logs to `/tmp/p2-focus-*.log`, read only the tail: the quiet-gates hook is not active in this session.
- **Out of scope:** M1 (sheets returning to `main` instead of the opener) stays on the polish list unless your fix closes it for free.
- **Deliver, under 15 lines:** commit SHAs, files, red→green evidence, gate results, sources cited, left out.
