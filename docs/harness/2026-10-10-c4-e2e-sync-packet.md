# Packet: c4-e2e-sync (defects qa7-63-flaky and capabilities-210-flaky; Codex, non-escalated)

- **Entry:** `c4-e2e-sync`. Worktree `/private/tmp/bower-c4-e2e-sync`, branch `c4-e2e-sync` from `claude/p3`.
- **Ruling:** the lead, 2026-10-10 (stage-4 close message: "with the qa7 and capabilities sync fixes"). Proposals are in LEAD_QUESTIONS (qa7-63-flaky corrected; capabilities-210-flaky).
- **Diagnoses:** DEFECT_LOG `qa7-63-flaky`; `docs/harness/defects/2026-10-10-capabilities-210-flaky.md`.
- **Starting model:** Codex. Then a fresh Claude review, and repeat runs by the coordinator.

## Contract

1. **qa7:63** "New note in an empty folder…": before typing the folder name, the spec waits until the name box is focused (`expect(...).toBeFocused()` on the new-folder name field). No bound changes and no retry.
2. **capabilities:210** "write it shows the state written…": the final `page.goto` (`:254`) becomes in-app navigation to Car, and the exact answered-row assertion and its timeout stay. If the test means to cover a reload, it reloads only after that exact result shows, then asserts it again.
3. No product change.

## Red

None. This is flaky timing. The proof is repeat runs: qa7:63 fake desktop `--repeat-each=12`, and capabilities:210 fake desktop `--repeat-each=8`, all passing. Before the fix, claude/p3 fails 4 of 12 and 1 of 4.

## Commits

1. The specs.
2. The notes (`docs/harness/2026-10-10-c4-e2e-sync-notes.md`), with `tests changed:` lines.
