# Packet: P2 supplemental walk at 3e6e7da (TL-P2-47)

Starting model: `bower-implementer` (Sonnet), fresh session. Reason: a bounded browser walk; contract judgement is in the dossier.

- **Target:** production build of `3e6e7da`, checkout `/private/tmp/bower-p2-dossier` (installed, `dist/` built). Serve `pnpm preview --port 5196 --strictPort > /tmp/p2-walk-preview.log 2>&1` there; stop it when done. Never edit tracked files.
- **Read:** `docs/harness/WORKER.md`, this packet, and in the checkout `e2e/focus-after-close.spec.ts` (exact F1/F2 steps). Nothing else.
- **Browser:** Playwright MCP tools. Before each focus reading, make sure the page has focus (`document.hasFocus()` true; click the page body first if not). Record evidence, not a word: after each step, `document.activeElement` tag + text and `document.hasFocus()` by script, plus a screenshot under `/private/tmp/p2-walk/`.
- **Cells:** DD demo 1440×900, DP demo 390×844, FD fake 1440×900, FP fake 390×844 (`/?scenario=default&time=instant`, add `&source=fake`). On fake, Ctrl+Shift+D → "Start this situation again" restores 15 things.
- **Walk:**
  1. F1 (all cells, close by Escape and by Skip) and F2 (all cells: Enter on "Add a pile", then on "Put the note in the inbox"), with a real keyboard (Tab and Enter, not clicks).
  2. C06 (a project note cites what it is about; follow the link) in FP, DD, DP.
  3. C07 (a contradiction asks a question linking both sources) and C01 (sign in, sign out) on DD and DP.
  4. Phone keyboard-only (DP and FP): the C04–C11 journeys driven by Tab/Enter/Escape only.
- **Judge:** Critical/Important = a person would notice (dead end, focus on BODY, wrong or missing effect, lost input) or a data risk; each with cell, URL, steps, expected vs actual, the activeElement record, screenshot. Minors one line. Unreachable = NOT RUN with the reason.
- **Return under 30 lines** (Write may be refused outside the repo; then return the report): per-cell table, findings, minors, NOT RUN, tool-use count.
