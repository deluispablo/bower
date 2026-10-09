# Packet: c3-flaky-policy (stage 3, TL-P4-20)

- **Entry:** `c3-flaky-policy` (harness). Worktree `/private/tmp/bower-c3-flaky`, branch `c3-flaky-policy` from `claude/p3`.
- **Ruling sweep:**
  - [TL-P4-20](2026-10-09-tl-p4-20-method-refinement.md), table row 9: "Never skip a test."
  - TL-P4-20 addendum 2 (context7 queries name only the library and the topic).
  - TL-P4-15: a retry-passed test enters the defect flow.
  - TL-P4-17 addendum 9: wall clock is a report, never a failure.
  - No DEFECT_LOG line.
- **Starting model:** `bower-implementer` (Sonnet).
- **Why:** today a flaky e2e is rerun by hand until it passes, so the flake is never logged.

## Contract

1. **Batch and freeze runs catch flakes.** The batch and freeze runs of the four suites (e2e, e2e:fake, e2e:pwa, as the coordinator runs them through `harness/with-lock.sh`) use one retry and Playwright's `failOnFlakyTests`.
   - A test that passes only on retry fails the run and is named as flaky.
   - Per-entry runs are unchanged.
   - Choose this through one switch (an env var or a script), not a second config file. Name it on your card.
2. **Quarantine file.** `harness/e2e-quarantine.json` lists `{test, owner, expires, defect}`. It starts empty.
   - A quarantined test still runs; it is never skipped. Its flaky result is reported, not failed, until it expires.
   - A script in check-harness fails when an entry has no owner, is past its expiry, or names a defect line that is not in `docs/harness/DEFECT_LOG.md`.
3. **Defect flow.** The run's output gives the coordinator what it needs for a DEFECT_LOG line: the test name, the project and the first failure's error. Document the steps in one line in `docs/harness/DEFECTS.md`.

## Red

A fixture e2e that fails its first attempt and passes on retry (driven by a counter file in a temp dir) passes a batch-mode run today.

## Verify (exact names)

- `a test that passes only on retry fails a batch run`
- `a quarantined test that passes on retry is reported, not failed`
- `a quarantine entry without an owner or past its expiry fails the check`
- `a quarantine entry must name a logged defect`
- `pnpm check` must be green. Name the test file(s) on your card.

## Commits

The red (tests only), then the fix, then the notes file in its own commit. The notes carry `tests changed:` lines for any existing test you touch.

## Checklist

TL-P4-13. Research first: cite Playwright's `retries` and `failOnFlakyTests` docs, and a quarantine practice (for example, Google's flaky-test write-ups). context7 queries name only the library and the topic.

Reviewers are read-only. They never move the main checkout in any form.
