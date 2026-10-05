# Current-v1 observations

Exact immutable source6305ca9; read-only independent observation, not O3 acceptance or assertion proof. The report preserves its original temporary paths; equivalent files and all eight snapshots are retained beside it. The results contain raw before/after bytes/tree/journal/report and loaded-source hashes. No real provider or service-wrapper result is claimed.

From the integration checkout, reproduce the original observation by restoring the script's CJS extension:

```sh
cp docs/harness/evidence/2026-10-05-o3/malformed-requests-probe.cjs.txt /private/tmp/bower-o3-malformed-observation-probe.cjs
node /private/tmp/bower-o3-malformed-observation-probe.cjs
```

It loads6305ca9 from Git, uses installed TypeScript, creates in-memory synthetic fake data and writes private temporary observations. Exit0 means completed observations, not passing feature assertions. New harness runner-request-preflight is planned and separate from this script.
