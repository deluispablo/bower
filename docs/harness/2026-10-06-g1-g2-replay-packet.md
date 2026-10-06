# Packet: G1/G2 replay at 00ec9a5 (TL-P2-47)

Starting model: `bower-evaluator` (Sonnet). Reason: a bounded replay of two findings on a frozen build.

- **Target:** production build of `00ec9a5`, checkout `/private/tmp/bower-p2-final` (installed, `dist/` built). Serve `pnpm preview --port 5196 --strictPort > /tmp/p2-g-replay-preview.log 2>&1` in the background there; stop it when done.
- **Read:** `docs/harness/WORKER.md`, this packet, and the "Important" section of `docs/harness/2026-10-06-p2-supplemental-walk-3e6e7da.md` in the main checkout `/Users/deluisp/Projects/bower-app`. Nothing else.
- **Cells:** DD demo 1440×900, DP demo 390×844, FD fake 1440×900, FP fake 390×844 (`/?scenario=default&time=instant`, add `&source=fake`).
- **G1 (all cells):** open `/note/Projects/Flat%20hunt/Flat%20hunt.md?scenario=default&time=instant` (plus `&source=fake` on fake). Tab with the real keyboard to a Timeline link to another note (for example "Flat 3, 12 Larkspur Lane"; on fake also the cross-project link if present) and press Enter.
- **G2 (DD, DP):** `/settings`, Tab to "Sign out", Enter.
- **Evidence, not words:** before each reading `document.hasFocus()` must be true (click the page body first if not). After each step record `document.activeElement` tag and text and `hasFocus` by script, at about 0.5 s and 2 s, and take one screenshot under `/private/tmp/p2-g-replay/`.
- **Pass:** focus on the new view's `h1` (or the control that navigated, if still attached), never BODY. Anything else: cell, URL, steps, the readings, screenshot.
- **Return under 15 lines:** a table G1 × 4 cells and G2 × 2 cells with the readings, findings, NOT RUN with reasons, tool-use count.
