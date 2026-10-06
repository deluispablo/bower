# Packet: route-focus regression fix (focus-note-link-and-sign-out, round 2)

Starting model: `bower-escalated` (Opus), fresh session. Reason: the Sonnet round delivered a router-level focus rule that regressed three e2e tests and reported them as pre-existing; this is a climb (TL-P2-42).

**Summary of the failed attempt (10 lines).** `cb9b7c9` added `RouteFocus` in `src/app/App.tsx` calling `focusRouteHeading()` (`src/ui/focus.ts`) on every pathname change: after 50 ms, retrying up to 12×, it focuses the new view's `h1` (tabindex -1) unless focus is inside `[role="tree"]`, then a MutationObserver re-focuses for 1 s if that h1 is replaced. Shell's old rescue was removed. G1, G2, the every-route sensor, F1/F2 and full demo `e2e` pass. On `E2E_SOURCE=fake` three tests now fail and pass 10/10 on `3e6e7da` (same command, `--repeat-each=2`):
- `e2e/qa28.spec.ts:141` (phone, desktop): arriving on a pile to paste a link again, the view focuses "Paste a link"; the route rule steals it to the h1.
- `e2e/qa5.spec.ts:38` "the run scene ends with an empty inbox": "Done. 15 things filed" never appears.
- `e2e/qa10.spec.ts:176` "no Remove while a tidy-up runs": the "Remove the pile" menu item is not found (likely a menu closed by the focus move).
Logs: `/tmp/p2-cmp-new.log`, `/tmp/p2-final4-e2e-fake.log`.

- **Checkout:** `/private/tmp/bower-p2-focus3`, branch `claude/p2-focus3`, from the integration head. Never push.
- **Read:** `docs/harness/WORKER.md`, this packet, and the diff `git diff e6c915b cb9b7c9`. Nothing else unless needed to explain a failing test.
- **Lead rule (TL-P2-47 amendment) still holds:** one router-level rule; every route change ends with focus on the new view's h1, never BODY; no per-link patches. **Research first** how proven routers do it and cite it (e.g. Reach Router / React Router focus management, Gatsby's route announcer, GOV.UK): typically focus moves only when the new view has not placed focus itself, and never interrupts focus the person or the view set after navigation (an autofocused field, an open menu or dialog).
- **Acceptance contract:**
  - Green: the three tests above on fake (phone and desktop, `--repeat-each=3`), plus `e2e/focus-after-close.spec.ts` on both sources (F1, F2, G1, G2, the sensor).
  - Observable: a view that focuses its own control on arrival keeps it; a menu, sheet or dialog opened after a route change is never closed by the rule; everything else lands on the h1.
  - Files in scope: `src/ui/focus.ts`, `src/ui/focus.test.ts`, `src/app/App.tsx`, and the e2e focus spec only if the contract needs a new case (for example the qa28 arrival). Anything else goes in "left out".
- **Gates:** the tests above, `pnpm check`, full `E2E_SOURCE=fake pnpm e2e` and `pnpm e2e` once at the end. Playwright on a private config on port 5195. Do not call a failure pre-existing without running it on `3e6e7da` (`/private/tmp/bower-p2-dossier`) the same way.
- **Deliver, under 15 lines:** commit SHAs, files, red→green evidence, gate results, sources cited, left out.
