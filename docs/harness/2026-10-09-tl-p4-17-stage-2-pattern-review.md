# Technical-lead decision TL-P4-17: stage 2 pattern review

**Lead ruling, 2026-10-09**, under [DEFECTS.md](DEFECTS.md) step 6. Every defect logged during stages 1 and 2 ([DEFECT_LOG.md](DEFECT_LOG.md), 24 lines) was read together. A class seen twice becomes a base-improvement entry. A rule broken by hand more than once becomes a machine check ([METHOD](METHOD.md), "Rules machines check").

## Classes

| Class | Defects | Seen | Outcome |
|---|---|---|---|
| A. Process slips | merge-before-check, close-before-review (twice), reviewer-checkout-main, conflict markers committed (stage 1) | 5 | Machine checks: entries `c3-integrate-gate` and `c3-reviewer-guard` |
| B. Tests that wait on real time or load | deadlines-test-flake, lost-bytes-slow, qa10-toast-flake, dependency-rules-timeout | 4 | Base improvement plus a ratchet: entry `c3-test-time` |
| C. Promised but never wired | retention-never-wired, smoke-runner-offline (the verify never drove the real runner) | 2 | Machine check `c3-unused-code`; packet rule below |
| D. Writes and account identity | unknown-write-copy, headless-offline-lost-write, journal-4xx-waits-forever, pile-note-retry-second-note, late-upload-undo-resend, delete-me-admit-window, sign-out-refuses-answers | 7 | Already given homes in stage 2 (transport failure table, write-once, account identity). No new entry; `c3-reservation-home` checks that the write-once home is the only one |
| E. Product behaviour | write-it-again, write-it-silent, keep-one-not-asked, words-only-pile-copy, home-empty-48s | 5 | Already ruled into `c3-subject`, `c3-pair-ask`, stage 1 and `c2-pile-records` |

## Entries (stage 3, Sonnet unless marked)

1. **`c3-integrate-gate`.** Each check has one home:
   - **Merges.** One script, `harness/integrate.sh <branch>`, is the only way a worker branch reaches `claude/p3`. It runs `git merge --no-ff --no-commit`, then `pnpm check` into a log file. It commits only when the check is green; otherwise it runs `git merge --abort` and prints the failures. This closes merge-before-check.
   - **Conflict markers.** `scripts/check-harness.mjs` (already in `pnpm check`) fails on any tracked file holding a line that is only a conflict marker (`<<<<<<< `, `=======`, `>>>>>>> `), listing file:line.
   - **Reviews.** `features.json` gains an optional `review` field (`"P4-NN PASS"`). `harness-rules.mjs` refuses `passes: true` for an entry whose task is `p4-consolidation` and whose packet marks it escalated, unless `review` names a PASS. `done.sh` reads the same rule, so closure stops before the merge. This closes close-before-review.
   - **Red:** three fixtures (a marker line, an escalated entry without a review, an integrate on a red tree), each failing today.
2. **`c3-reviewer-guard`.** A second `PreToolUse` Bash hook, `scripts/guard-main-checkout.mjs`, beside `quiet-gates.mjs`. Inside a subagent it refuses `git checkout|switch|reset|rebase|merge|stash` when the command runs in the main checkout `/Users/deluisp/Projects/bower-app`, and points to `git show`, `git diff` or a scratch worktree. The coordinator's own session is not refused. First check which hook input field marks a subagent (`agent_type` or `agent_id`), and cite the Claude Code hooks reference. If no such field exists, put the hook in the reviewer and evaluator agent frontmatter instead. **Red:** a hook test that feeds a reviewer checkout and expects a block.
3. **`c3-test-time`.** Unit tests never wait on real time:
   - backoff, deadlines and toasts take the injected clock or the transport options that `c2-transport-options` added, or fake timers;
   - the `dependency-rules` test stops running dependency-cruiser inside vitest, because `scripts/check-dependencies.mjs` already runs it in `pnpm check`. Two runs of one rule is a second way. Keep only a fast unit test of the rule list. This answers the queued dependency-rules-timeout diagnosis: give the diagnoser this ruling as its starting point, or close the line as ruled here.
   - **Ratchet:** `check-harness.mjs` already reads `test-results/unit.json`. Any unit test over 1000 ms fails unless it is in `harness/slow-tests.json`, a list that may only shrink, like the jscpd baseline. The baseline is today's list.
   - qa10 stays with `c4-focus-return` (main 7a708aa).
4. **`c3-unused-code`.** Adopt [knip](https://knip.dev), the standard detector of unused files, exports and dependencies, in `pnpm check` with a baseline that may only shrink (same pattern as `check-duplication-gate.mjs`). keepFinished had no production caller and would have been caught by knip. Remove what it finds dead in the same entry, or list it under "left out".

**Packet rule (TL-P4-13 checklist, one line):** when an entry promises a behaviour, its verify drives the real entry point that runs it in production (the Worker route, the runner's `main`, the screen), not only the helper.

## Order

`c3-reservation-home` (escalated) and `c3-integrate-gate` start together, which makes two workers. Then come `c3-test-time`, `c3-reviewer-guard` and `c3-unused-code`, then the rest of stage 3 as listed in [TL-P4-14](2026-10-08-tl-p4-14-consolidation.md). The goldens and the removed-lines rule apply as in every stage. These entries are harness code, so production net does not count them, but their own diffs report removed lines.
