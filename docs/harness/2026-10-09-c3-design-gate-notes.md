# c3-design-gate notes

- One rule: `reviewProblem` in scripts/harness-rules.mjs now also refuses a `ui: true` entry unless `design` is "verified". `problems()` and done.sh already call it; no second checker.
- c3-pair-ask marked `ui: true`. Closed entries untouched.
- Tests: three in src/harness.test.ts (rule, done.sh via scratch dir, non-ui guard). Check log: /tmp/c3d-check.log.
- Standard: same pattern as the escalated review PASS rule (TL-P4-17 entry 1).
