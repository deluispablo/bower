# Packet: smoke-request-report-hidden, a finished report stays reachable (restores the C05 spec; lead ruling (a) 2026-10-10)

- **Entry:** `smoke-request-report-hidden`. Worktree `/private/tmp/bower-smoke-request-report-hidden`, branch `smoke-request-report-hidden`. Non-escalated, so Codex works test-first, followed by a Codex pass and a Claude review. `ui: true`. This restores an approved spec (the C05 spec's "run result"), so it is exempt from the owner's OK under TL-P4-40. The designer confirms the rows below before dispatch and checks the built result.
- **Evidence:** staging 2ab7b490. After a request-only run (scope `instructions`) whose report carried a "Left as you wrote them" row, Home showed no report card, and the status bar's last tidy-up opened "Nothing to tidy". Diagnosis: `docs/harness/defects/2026-10-10-request-outcome-not-shown-diagnosis.md`. `Home.tsx:54` and `run-words.ts:47` (`hasReplay`) show a report only for `all` runs with filings, and `TidySheet.tsx:26` hides a finished run that was not being watched.
- **Ruling (a):** a finished report is reachable whenever it has any row (filed, created, updated, set aside, questions, left as you wrote them), whatever its scope. The replay rules stay as they are, and the Bower bubble is unchanged (option (b) is not done now).

## What the person sees (designer confirmed; DECISIONS after d57e04e0)

- **Home, after a finished run with any row, whatever its scope:**
  - the report card with today's runTitle and runDetail (e.g. "Done. Bower read your changes");
  - the RunLinks rows under today's labels;
  - "Watch what Bower did" only when hasReplay, otherwise "Got it" alone.
- **No rows means no card,** as today.
- **The reopened sheet** (status bar → last tidy-up) shows the same unseen report, never "Nothing to tidy".
- No new strings.
- **The designer checks** a request-only run on demo and fake, at 1440 and 375, on Home and in the reopened sheet.

## Tests (TDD)

A screen-level red through Home and the status bar (component tests plus `e2e/c05-person-notes.spec.ts` or a new spec on demo and fake). It covers:
- an `instructions` run with only a leftAsWritten row: the card and the sheet show "Left as you wrote them" with the why and the link;
- the positive control: an `all` run is unchanged;
- a no-row run: still "Nothing to tidy";
- axe with WCAG 2.2 tags and target-size.

## Verify

The reds by exact name, then `pnpm check`, then e2e for app, c05-person-notes and qa5 on demo and fake.

## Commits

The red (tests only), then the fix, then the notes (`docs/harness/2026-10-10-smoke-request-report-hidden-notes.md`, line 3 `implementer: codex`).
