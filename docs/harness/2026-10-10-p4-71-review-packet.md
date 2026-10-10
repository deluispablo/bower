# Packet: P4-71 review (c4-e2e-sync, written by Codex; defects qa7-63-flaky and capabilities-210-flaky)

This review is read-only and fresh. Do not run e2e, start a server or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-e2e-sync`.

## What to review

- **Diff:** `git diff claude/p3...c4-e2e-sync`: the specs and the notes.
- **Packet:** `docs/harness/2026-10-10-c4-e2e-sync-packet.md`.
- **Diagnoses:** DEFECT_LOG `qa7-63-flaky`; `docs/harness/defects/2026-10-10-capabilities-210-flaky.md`.

## Look hardest at

- **qa7:63.** It waits for the right element (the new-folder name box) before typing. Is the role or name match exact enough that it cannot pass early?
- **capabilities:210.** In-app navigation to Car replaces `page.goto`. The answered-row assertion and its 20 s timeout are unchanged. Does the test still prove what its title promises, and does dropping the reload lose any coverage the title claims?
- **No other change:** no bound, retry or product file.
- **`tests changed:` lines** cover both specs.

Already run by the coordinator, on fake desktop: qa7:63 `--repeat-each=12` 12/12, capabilities:210 `--repeat-each=8` 8/8, and pnpm check green.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
