# Packet: q1b-questions-ui (Q1b: Q-UI-1, -2 and -4; ui: true)

- **Entry:** `q1b-questions-ui`. Worktree `/private/tmp/bower-q1b-questions-ui`, branch `q1b-questions-ui`. Non-escalated presentation: Codex red, Codex implementation, Claude review, then the designer's verified (TL-P4-18 addendum 3). After Q1a stored answers and Q1c live publication integrate.
- **Spec:** `docs/design/specs/2026-10-10-questions-ui.md` (owner OK, claude/design fd72ed69; repository copy includes addendum 2's yes/no “Something else…”). Rulings: TL-P4-43, TL-P4-44 and addenda 1–2 and 6–8; `docs/harness/2026-10-10-tl-p4-44-q1-contract.md`; Q-UI rows in `docs/harness/2026-10-10-q1-prep.md`. Spec is read-only.
- **Owned files:** `src/features/home/Home.tsx`, `src/features/home/Home.test.tsx`, `src/features/home/home.module.css`, `src/features/tidy/TidySheet.tsx`, new `src/features/tidy/TidySheet.test.tsx`, `src/features/tidy/tidy.module.css`, `src/features/piles/PileScreen.tsx`, `src/features/piles/PileScreen.test.tsx`, `src/features/piles/piles.module.css`, new `e2e/q1-questions.spec.ts`. Read ports: `src/data/sources.ts` (`vault.questions()`, `vault.piles()`, `vault.pilesListed()`, subscriptions, `runs.current()`); `src/data/provider.tsx` hooks; `src/data/contracts/types.ts` Question/Pile/RunState; `src/data/contracts/questions.ts` subject policy and answer types; `src/data/answer-loop.ts` answerQuestion. No data-port write ownership or new store.

## Contract
Build exactly Q-UI-1, -2 and -4. Export/reuse Home's Questions in RunView inside TidySheet; one card and answer handler. Preserve text, about links and Bower's update. Yes/no keeps primary yes/ghost no; options use full-width, left-aligned ghost sm buttons, no primary option, 8 px gaps and 10 px above. Inbox/pile questions also offer Something else… in brand-line, including yes/no (8 px below its row); never state/pair.
Text mode replaces the buttons with labelled Field Textarea, focused immediately, Tell Bower primary sm and Cancel ghost sm. Cancel restores the original controls and focuses Something else…. Trim text; disable submission when empty or over 1,000 characters; show Field's exact error with errorId/aria-invalid. No counter or maxLength.
Use Q1a's answerQuestion(vault, runs, id, answer, { allowWeb }) with true/false, { option: id } or { text }; never resolve an action by label. Stored file-to options bind 2–4 folder ids. One journal answer and existing continuation; use answerToast with the option label or “your words”, preserving all existing outcomes. Save failure retains the card and draft.
Read Q1c's merged vault.questions(): asking identity is id plus askedAt, Drive wins, and journal answers prevent resurrection. The live snapshot belongs to existing run state (v15 runs column), not a UI store. Publication follows persisted plan; display bounds never fail the run. Live shows the first 10 by askedAt, omits out-of-bound cards with a console line, and all askings remain stored for Home after the run.
RunView shows the earliest unanswered question from this run between runDetail and steps, under “Bower has a question” using runStyles.linksLabel, bg on bg-alt. “N more questions on Home” counts this run's other stored unanswered questions honestly, navigates Home and closes the sheet. Preserve steps/clock; done retains the unanswered card above RunLinks. Answers remove it on both surfaces; focus goes to the next question or heading, and after the sheet's last card to its title (tabIndex -1).
Use Pile.question's waiting/exhausted projection, no UI round counter. Waiting wins over exhausted; upload/error/readiness lines win over both. Render the exact row copy and exhausted paragraph below heading meta (17 px, text). Existing words/Move controls remain; words changes reset exhaustion. No new pills, icons or buttons; run chip, right panel and confirm sheet remain as approved.
Today's Sheet/Button/Field and tokens only. Q-UI-3 owns global sheet CSS and its desktop red separately; Q1b verifies the combined card/text stack under that landed fix. Use Q1a/Q1c fixtures; missing backend scenarios return to their owners.

## Tests (the spec's test table, verbatim)

## What the person sees: rows to test

| Situation | What shows |
| --- | --- |
| A question with options on Home | The stacked ghost buttons and "Something else…" (inbox and pile questions only). |
| A yes/no question about an inbox thing or pile | Today's yes/no row, with "Something else…" below it at full width. |
| "Something else…" pressed | "In your own words", the focused Textarea, "Tell Bower" (disabled while empty) and "Cancel". |
| Cancel | The options come back; focus is on "Something else…". |
| An answer on Home, no run live | The card goes; today's `answeredNow` toast. |
| A question during the run, sheet open | The label "Bower has a question" and the card above the steps; "N more questions on Home" when there are more. |
| An answer during the run | The card goes; today's `waits` toast. |
| The run ends with a question unanswered | Done sheet: today's "… and 1 question for you", and the card above RunLinks. |
| The pile row while a question waits | "Waiting for your answer" in accent-line. |
| After 2 rounds | Row: "Bower couldn't place this" (muted). Pile page: the full sentence as a plain line. |
| Over 1,000 characters typed | "Tell Bower" disabled; the error line "Use 1,000 characters at most." |
| The last card in the sheet answered | Focus on the sheet's title. |
| An answer in the sheet | The same card is gone from Home too. |
| A tall sheet on a 1280×720 desktop | The sheet stays inside the window and scrolls. |

Accessibility: every control is a real button, with targets at least 44 px on coarse pointers (today's sm rule). The Textarea is labelled "In your own words". Focus moves as listed. Axe runs at WCAG 2.2 on Home and the sheet, on demo and fake, at 375 and 1440.

## Verify
The reds by exact name, `pnpm check`, Home/TidySheet/PileScreen component regressions and touched-screen e2e plus `e2e/q1-questions.spec.ts` on demo and fake at 375 and 1440; keyboard flow, duplicate label-id checks across both cards, save-failure retention, and axe WCAG 2.2. Verify the combined stack at 1280×720 under Q-UI-3. Test output to files; read failures only. Designer verifies built Q-UI-1/-2/-4 before closure.

## Commits
Red, fix, notes (`docs/harness/2026-10-11-q1b-questions-ui-notes.md`, line 3 `implementer: codex`).

## Ruled (lead)

- TL-P4-44 addendum 9: a question belongs to the current run when its askedAt is at or after the run's start time in the public RunState (the one the clock already shows). The sheet shows the earliest open one; "N more" counts the other open ones in that window. Live and stored askings alike. No runId on Question, no data-port or runner change: Q1b stays UI-only.
- The table is signed by the designer before the red session starts (TL-P4-43).
