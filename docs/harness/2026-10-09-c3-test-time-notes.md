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

## Fix round (TL-P4-17 addendum 6)

- Merged claude/p3 (b69367f7), no conflict. Red 70dd907c.
- Alone-time ratchet: slowProblems(tests, list, ceiling, alone). A test over 1000 ms in the full run and not on the list is rerun alone
  (scripts/harness-alone.mjs: vitest `-t '^suite > test$'`; the filter joins with " > ", the report with a space); only that time counts.
  Fixture test: "a test slow in the full run and fast alone passes the slow ratchet". The rerun falls back to the full-run time if it cannot find the test.
- Slow list rebuilt from alone times: 20 -> 8 (SLOW_CEILING 8): Home latency x3, read cache, Home questions, LiveSession createFolder,
  report save B path, architecture dynamic imports. Dropped (fast alone, 230-850 ms): upload queue x5, run manifest 1 MB id, recovery killed run,
  vault move, duplication gate, runner data errors. The 1 MB run-manifest line is gone: its it.each title is now a label (it printed %j of a 1 MB id).
- Knip gate test: scripts/unused-gate-rules.mjs (findingsOf, compare) fed a fixture report; check-unused-gate.mjs is the tool's one home. No spawn in vitest.
- Reservation rule targets the primitive only: generateIds, reserveId, createById (call, member, alias, destructure). Holder-name, slot and map selectors removed.
  write-once.test.ts fixtures: renamed holder, renamed slot, alias; the home's makers (makeOnce, makeFolder, makeText, reserveFor) are not flagged.
  Lost vs addendum 4's rule: the by-hand slot (`reserved`) and Map<holder> selectors (they were name-based).
