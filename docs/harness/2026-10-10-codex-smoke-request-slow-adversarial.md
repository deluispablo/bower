**smoke-request-slow — adversarial review, pass 1**

Verdict: **BLOCK**

Blocking — [src/data/spine/scripted.ts:2051](/private/tmp/bower-smoke-request-slow/src/data/spine/scripted.ts:2051): a waiting retry does not publish its new recovery pointer.

Scenario: run A clashes and leaves the request in `pending/A`. Run B successfully appends and records completion, but its archive PATCH fails before landing. The next tidy-up still reads A’s rejected append, ignoring B’s completion. Unchanged wording records a second completion through `satisfiedAppends` at line 2266; different wording, permitted at line 1231, causes a second append too. This needs no hand restore, rename or expired history.

Missing coverage: **successful waiting retry followed by failed archive publication and another tidy-up**. Existing interrupted-move controls cover the initial append.

Second mechanism: **no**; the implementation reuses moves and RunRecords.

Minor / v1 limits:

- [src/data/spine/plan.ts:134](/private/tmp/bower-smoke-request-slow/src/data/spine/plan.ts:134): a declared pile whose context was removed externally still scans every archived JSON through `journalFiles(true)`. The goldens omit this path.
- Full check/e2e remain unverified: the notes report server-listen `EPERM`. This review ran no tests or writes.
