# Packet: c02-upload-count-ui (C02 E4 and the sign-out sheet; ui: true)

- **Entry:** `c02-upload-count-ui`. Worktree `/private/tmp/bower-c02-upload-count-ui`. Non-escalated presentation: Codex red, Codex implementation, Claude review, then the designer's verified (TL-P4-18 addendum 3). After upload-resume-after-reload, upload-sign-out-forget and orphan-pile-count-data integrate.
- **Spec:** `docs/design/specs/2026-10-10-c02-upload-count.md` (owner OK, TL-P4-53 addendum 1; claude/design cd30c6c1). Rulings: TL-P4-53 and addendum 1 (the "Sign out now?" sheet is the owner's choice).
- **Owned files:** `src/features/home/Home.tsx`, `Home.test.tsx`, `home.module.css`; the Settings sign-out (`src/features/settings/` sign-out button and its test); new `e2e/c02-upload-reload.spec.ts` and `e2e/c02-orphan-count.spec.ts`. Reads the count summary from orphan-pile-count-data and the pending count from the upload queue's one home; no count computed in JSX, no second store.

## Contract
Build exactly the spec: U1–U2 (the Inbox line, informational only, no jargon) and U3 (reload shows today's sending/waiting state; the "Sign out now?" sheet only while something is sending, Keep sending first and focused, Sign out purges per Q1; nothing sending signs out as today). Today's Sheet, Button and Inbox card; tokens only.

## Tests (the spec's test table, verbatim)

## What the person sees: rows to test

| Situation | What shows |
| --- | --- |
| No pile left unfinished | The Inbox card exactly as today. |
| 1 / 3 unfinished, full read | The singular / plural line in accent-line, under the waiting line. |
| A read that failed in part | "At least …" with the count Bower knows. |
| Nothing could be checked | "Bower couldn't check that everything you added arrived." (muted); never 0. |
| Reload while files are sending | The pile shows sending or waiting; no picker opens. |
| Sign out while 2 things send | The "Sign out now?" sheet; Keep sending keeps them, Sign out stops them. |
| Sign out with nothing sending | No sheet, as today. |

Accessibility: the sheet is today's Sheet (focus trap, Escape is Keep sending, focus returns to Sign out). Axe at WCAG 2.2 on Home and Settings, on demo and fake, at 375 and 1440.

## Verify
The reds by exact name, `pnpm check`, e2e home/settings plus the two new specs on demo and fake, axe at 375 and 1440.

## Commits
Red, fix, notes (`docs/harness/2026-10-10-c02-upload-count-ui-notes.md`, line 3 `implementer: codex`).
