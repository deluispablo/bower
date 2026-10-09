# c3-integrate-gate notes

- Red 754c5276 (tests only; 4 fixtures failing on assertions). Fix commit follows it on branch c3-integrate-gate.
- Rules: `reviewProblem` and `conflictMarkers` in scripts/harness-rules.mjs (one home each). check-harness.mjs scans markers
  first and exits early (before the slow playwright listing). done.sh calls `reviewProblem` before step 1.
- harness/integrate.sh <branch>: dirty tree refused; merge --no-ff --no-commit; INTEGRATE_CHECK (default `pnpm check`) to a
  /tmp log; green commits with `--no-edit` (standard merge message); red `git merge --abort` and prints FAIL/error lines.
  Runs in the repo it is started in; tests use throwaway repos only.
- Backfill `review` (task p4-consolidation, escalated, closed): c1-worker-deadlines P4-22, c2-runner-exit P4-24,
  c2-drive-transport P4-25b, c2-read-cache P4-28a, c2-worker-dispatch P4-30, c2-one-engine P4-35d, c2-write-once P4-36b,
  c2-create-by-id P4-37f (all PASS, from ACTIVE.md). spine-operations-checkpoints is task p3, so outside the rule.
- Removed: 0 lines. Added production: rules +29, check-harness +7, done.sh +8, integrate.sh 28.
- Sources: git-merge docs (--no-commit, --abort); pre-merge CI gate pattern (merge queue / Zuul: test the merged tree, then land).
- Left out: c3-integrate-gate not closed (coordinator). Marker `=======` also matches a bare 7-equals line in any tracked file.
