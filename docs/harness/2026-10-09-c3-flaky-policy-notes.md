# c3-flaky-policy notes

- Switch: `E2E_BATCH=1` (e2e/batch.ts, read by playwright.config.ts and e2e/pwa.config.ts). Batch: `retries: 1`, `failOnFlakyTests: true`, plus the reporter scripts/e2e-flaky.mjs. No env var: unchanged.
- Reporter prints, per retry-passed test: project, test title, first failure line. A valid quarantine entry turns the failed status back to passed only when nothing else failed.
- Quarantine: harness/e2e-quarantine.json (empty). Rule in scripts/e2e-flaky.mjs, run by check-harness.mjs (`--quarantine <file> --defect-log <file>` runs only it). Entry `test` matches the test title; `defect` is the id in a DEFECT_LOG line.
- Tests: src/harness.test.ts. Fixture e2e is written to test-results/fx-* by the harness test only, on the real playwright.config.ts.
- Sources: https://playwright.dev/docs/api/class-testconfig#test-config-retries, #test-config-fail-on-flaky-tests, https://playwright.dev/docs/api/class-reporter#reporter-on-end, https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
- Left out: wiring E2E_BATCH into integrate.sh/COORDINATION (coordinator sets it); matching quarantine by project.

tests changed: src/harness.test.ts: the scratch-repo helper copies scripts/e2e-flaky.mjs, which check-harness.mjs now imports; no assertion changed
