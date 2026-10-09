# Packet: c3-integrate-gate (stage 3)

- **Entry:** `c3-integrate-gate` (harness). Ruling: TL-P4-17 entry 1 ([doc](2026-10-09-tl-p4-17-stage-2-pattern-review.md), main e1bbf010). Worktree `/private/tmp/bower-c3-gate`, branch `c3-integrate-gate` from `claude/p3`.
- **Starting model:** `bower-implementer` (Sonnet). Harness scripts only, no app data.
- **Live evidence:** DEFECT_LOG lines merge-before-check, close-before-review (seen twice) and the stage 1 conflict markers committed (5cfcb689, fixed 022194da).

## Contract (one home per check)

1. **Merges: `harness/integrate.sh <branch>`.**
   - It runs `git merge --no-ff --no-commit <branch>`, then `pnpm check` with output to a log file under `/tmp`.
   - Green: it commits with the standard merge message.
   - Red: it runs `git merge --abort` and prints only the failures.
   - Refuse to start on a dirty tree.
2. **Conflict markers: `scripts/check-harness.mjs`.**
   - Fail on any tracked file holding a line that is only a conflict marker (`<<<<<<< `, `=======`, `>>>>>>> ` at line start). List each as file:line.
   - Use `git grep`, which covers tracked files only.
   - Exclude nothing unless a fixture needs it; then name the fixture path explicitly.
3. **Reviews: optional `review` field in features.json (`"P4-NN PASS"`).**
   - `scripts/harness-rules.mjs` refuses `passes: true` for an entry with task `p4-consolidation` that is escalated, unless `review` names a PASS.
   - An entry is escalated when its note says `Starting model: bower-escalated`; follow how the notes read today.
   - `harness/done.sh` uses the same rule (one home) and stops before closing.
   - Backfill `review` on the already-closed escalated entries from ACTIVE.md (for example c2-create-by-id: P4-37f PASS; spine-operations-checkpoints: P4-38e PASS), so the check is green today.

## Red

One fixture per rule, each failing before the change:
- a marker line;
- an escalated entry without a review;
- an integrate on a tree that fails the check (a stub check command is fine; do not run the real suite inside the test).

## Verify (exact, from features.json)

`pnpm exec vitest run src/harness.test.ts src/harness-git.test.ts -t` with:
- "the harness check fails on a conflict-marker line and names file and line"
- "an escalated consolidation entry cannot pass without a review PASS"
- "done.sh refuses to close an escalated entry with no review PASS"
- "integrate.sh aborts a merge whose tree fails the check"

Real entry point (TL-P4-17): these tests drive `check-harness.mjs`, `done.sh` and `integrate.sh` themselves, not only the helpers. Then `pnpm check` must be green.

## Checklist

- Match entries by id.
- Every message the scripts print is backed by a test.
- The card names the exact verify tests and reports `removed: <lines>`.
- Research first: cite git's `merge --no-commit`/`--abort` docs and a pre-merge CI gate pattern.
- Reviewers: read-only, unit tests only, never `git checkout` in the main repo.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
