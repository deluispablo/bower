**smoke-request-slow — adversarial review, pass 2 (scoped)**

Verdict: **BLOCK**

Blocking — [src/data/vault/vault-index.ts:84](/private/tmp/bower-smoke-request-slow/src/data/vault/vault-index.ts:84): the old pending folder overrides the newly published recovery pointer.

Scenario: A clashes, leaving the request in `pending/A`. B publishes `bowerRun=B` through [scripted.ts:2055](/private/tmp/bower-smoke-request-slow/src/data/spine/scripted.ts:2055), successfully appends, then its relocation to `pending/B` fails before landing. Read-back rejects that move; B records its append completion, and its dependent archive remains unapplied. The request still lives in `pending/A` with `bowerRun=B`.

The next ordinary tidy-up selects A because `waitingRun()` returns the containing folder’s name before checking the property. It ignores B’s completion. Identical wording can record a second completion; changed wording can also append again. This requires only a failed Drive move, with no manual restoration or expired history.

Missing red: **successful waiting retry followed by failed pending relocation and another tidy-up**. The committed red interrupts only the archive PATCH at [c05-bounded-reads.test.ts:417](/private/tmp/bower-smoke-request-slow/runner/test/c05-bounded-reads.test.ts:417), after relocation to B has landed.

The exact pass 1 archive-failure scenario is fixed. The red loosened nothing: coverage is additive, existing bounds remain unchanged, and the test file is unchanged after `10469d88`.

Second mechanism: **no**. The fix reuses in-place moves, pending relocation and RunRecords. History lookup remains restricted to the selected run, but the scenario above selects the stale run.

Minor / v1 limits:

- Tests were not run during this read-only review. Implementation notes report green unit suites; full check/e2e remain incomplete because server startup failed with `EPERM`.
