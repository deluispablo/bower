# c3-test-time: notes

- Sources: vitest fake timers (https://vitest.dev/guide/mocking/timers); Fowler, "Eradicating non-determinism in tests"; ESLint no-restricted-syntax (selectors, esquery).
- Slow list: before 16 tests over 1000 ms (0cc1247a); after 20 lines in harness/slow-tests.json (ceiling in scripts/harness-rules.mjs).
  Dependency rules (3.2 s) is gone. The list grew by parametrized variants and borderline tests (1000-1200 ms) that crossed 1000 ms in
  check runs, so the ratchet is not flaky: reload resumes x4, expired session x2, recovery run killed, vault contract move keeps content.
- Lost bytes already ran in ~20 ms (c2-transport-options, pacing baseMs 0 in device()); its in-test 1000 ms bound stays. Nothing to change.
- Removed: dependency-cruiser runs from dependency-rules.test.ts and architecture "screens never import" (kept by name, now a rule-list test).
  Left: architecture "the import rule sees dynamic and relative imports" runs fixtures through the gate (3 s, on the slow list).
- Reservation rule (addendum 4): scripts/eslint-reservation.mjs, used by the 3 eslint configs; write-once.test.ts keeps both names, now fixture tests.
  Lost vs the old AST scan: per-file site counts (allowlist is files, max 9) and type-derived holders (HOLDERS name list in the module).
- Not sped up (compute-bound, not waiting): report save failure B path (10 s, MiB notes), Home latency fake tests (measure real latency ratio).
