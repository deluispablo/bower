# Packet: P4-93 review (smoke-request-report-hidden, ui: true, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-smoke-request-report-hidden`.

## What to review

- **Diff:** `git diff claude/p3...smoke-request-report-hidden -- src e2e` with the notes; Codex pass PASS (`docs/harness/2026-10-10-codex-smoke-request-report-hidden-adversarial.md`, on an earlier HEAD; fix round 2 came after).
- **Contract:** the packet's "What the person sees" rows (designer-confirmed) plus the designer's two checks: a Tidy up press always asks; only the status bar reopens an unseen report; a filing run keeps today's card words with Watch when hasReplay; runTitle/runDetail only for a run with nothing to replay; runDetail leaves out the fallback "Everything has its place." whenever the report has Left rows (card, reopened sheet, right panel); no rows, no card; no new strings.
- **Coordinator evidence:** e2e request-report-hidden red 16 → green; check, app, c05 and qa5 e2e green on demo and fake.

## Look hardest at

- One reachability rule (reportWaiting) and one detail rule (runDetail); no second way; no loosened existing test (the red commit fcd23584 once loosened Home.test's first-press test; it was restored in 5fcfd208 — confirm).
- Seen/acknowledge state and focus: Home loading never opens a sheet by itself; Got it acknowledges.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
