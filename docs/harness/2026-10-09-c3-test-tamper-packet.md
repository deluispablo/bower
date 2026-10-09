# Packet: c3-test-tamper (stage 3, TL-P4-20)

- **Entry:** `c3-test-tamper` (harness). Worktree `/private/tmp/bower-c3-tamper`, branch `c3-test-tamper` from `claude/p3`.
- **Ruling sweep:**
  - [TL-P4-20](2026-10-09-tl-p4-20-method-refinement.md), table row 1. The WORKER line and the review skill check are already done by the lead.
  - TL-P4-20 addendum 2 (context7 queries name only the library and the topic).
  - TL-P4-17 (integrate.sh is the one merge path).
  - No DEFECT_LOG line.
- **Starting model:** `bower-implementer` (Sonnet).
- **Why:** nothing flags a changed or deleted test. Red→green proves only that a new test can fail once (ImpossibleBench: agents pass by editing tests).

## Contract

1. **Tests-changed lines.** Every existing test or e2e file that a branch modifies or deletes needs one line `tests changed: <file>: <why>` in a notes file that the same branch adds or changes. A file counts when `git diff --diff-filter=DM <base>...HEAD` lists it and it matches the repo's test globs (`*.test.ts(x)`, `e2e/**/*.spec.ts`, and runner and api tests).
   - A missing line fails `integrate.sh`, before the check runs, with one line per file.
   - The same rule runs in check-harness against the branch's merge base with `claude/p3`, so a worker sees it locally.
   - It is one rule in one home (harness-rules or check-harness), with no second copy in integrate.sh. integrate.sh calls it.
2. **No focused e2e.** Set `forbidOnly: true` in `playwright.config.ts` and `e2e/pwa.config.ts`.
3. **No new focused or skipped unit tests.** A `.only` or `.skip` (and `it.todo` / `test.fixme` if added) in a unit test file fails `pnpm check`.
   - Use the standard lint rule if one exists for vitest (research it and cite it: the vitest ESLint plugin's `no-focused-tests` / `no-disabled-tests`). Otherwise use a check-harness rule.
   - None exists today, so there is no allowlist.
4. History readers judge HEAD plus MERGE_HEAD, as integrate.sh already does (c3-integrate-history).

## Red

A fixture branch that edits an existing test with no tests-changed line passes `integrate.sh` today.

## Verify (exact names)

- `a branch that changes an existing test without a tests-changed line fails integration`
- `a tests-changed line for each changed test lets the branch pass`
- `a deleted test needs its own tests-changed line`
- `a focused or skipped unit test fails the check`
- `both playwright configs forbid only`
- `pnpm check` must be green. Name the test file(s) on your card.

## Commits

The red (tests only), then the fix, then the notes file in its own commit. Your own notes carry `tests changed:` lines for any existing test you touch.

## Checklist

TL-P4-13. Research first: cite the Playwright `forbidOnly` docs and the vitest lint rule docs. context7 queries name only the library and the topic.

Reviewers are read-only. They never move the main checkout in any form.
