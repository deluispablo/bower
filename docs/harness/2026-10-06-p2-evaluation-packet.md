# Packet: P2 phone/desktop evaluation at the freeze

Starting model: `bower-implementer` (Sonnet). Reason: scripted browser walk-through with no design choices; contract judgement stays with the batch review ([TL-P2-46](2026-10-06-tl-p2-46-review-fallback.md) §4 runs it alongside).

- **Target:** frozen `4d7ab08`, checkout `/private/tmp/bower-p2-freeze` (installed and built; `dist/` is the production build). Never edit tracked files there.
- **Serve:** `pnpm preview --port 5196 --strictPort > /tmp/p2-eval-preview.log 2>&1` in that checkout (never 5191/5192). Stop it when done.
- **Read:** `docs/harness/WORKER.md`, this packet, and in the checkout `docs/P2_ACCEPTANCE.md` (capability matrix and "End-to-end synthetic journeys") plus `docs/harness/2026-10-06-tl-p2-38-fast-close.md` §1 for what P2 still proves. Nothing else.
- **Cells:** fake and demo source (`/?source=fake&scenario=default&time=instant`, `/?source=demo&...`), each at desktop 1440×900 and phone 390×844. Desktop-only controls are N/A on phone, not passed.
- **Walk, per cell:** C01 sign in/out (fake); C02 add a file, a link and a note as a pile, reload mid-upload; C03 browse, search, move, rename, edit a task, Bin and restore; C04–C11 one scripted journey each (ask → run → the effect is shown and linked; use the demo situations menu, Ctrl/Meta+Shift+D, to reach the scenarios); C12 a tidy-up start to report and replay after reload; C14 "Use here" takeover in a second tab; C16 keyboard-only pass of the primary journey, focus after closing sheets, console free of unexplained errors.
- **Browser:** the Playwright MCP tools. Prefer accessibility snapshots; take a screenshot only as evidence of a finding. Keep console logs per cell.
- **Judge:** Critical/Important = a person would notice (broken or dead-end journey, wrong or missing effect, lost input, focus lost to body, unexplained console error, placeholder action) or a data risk. Each finding: cell, URL, steps, expected vs actual, screenshot path. Minors: one line each. Unreachable checks: NOT RUN with the reason; never report a pass you did not see.
- **Write** the report and evidence under `/private/tmp/p2-eval/` (`report.md`, screenshots). Return under 40 lines: per-cell pass/fail table by C row, blocking findings, minors, NOT RUN.
