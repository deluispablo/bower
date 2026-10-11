# Questions that don't block: the UI (TL-P4-40)

The owner OKed this on 2026-10-10: the "Refined: least change" page of the "Bower questions" canvas, boards R1–R8. It reuses today's pieces. The lead confirmed the back end on 2026-10-10: Q1 builds `options`, the widened answer, live questions in the run status, and the round count per subject. Severity (NN/g): major (new behaviour). Details added 2026-10-10 from the lead's Q1b consult (TL-P4-44 Q9): first question, focus in the sheet, one source, length. The earlier draft pages on the canvas are reference only and are not to be built.

## Q-UI-1. The question card gains options and "Something else…" (one home: Home's `Questions`, Home.tsx)

- **Unchanged:** text, the `about` link and "Bower's update". A yes/no question keeps today's row: primary `yes`, ghost `no`.
- **Options** (`Question.options`, at most 4): they replace the yes/no row with a vertical stack of `Button size="sm" variant="ghost"` at full width, left-aligned, label only (for example "Projects / Job hunt"). No option is primary. A gap of 8 px, and 10 px above, as `.question .row2`.
- **"Something else…":** the last button of the stack, the same ghost sm, with its label in `--brand-line`. It shows only on a question about an inbox thing or pile, and never on state or pair questions.
- **On a yes/no question** about an inbox thing or pile (owner OK 2026-10-10): a full-width ghost sm "Something else…" (label in `--brand-line`) sits 8 px below the yes/no row. It opens the same text box in place, and Cancel brings back the yes/no row.
- **Pressing "Something else…":** the buttons are replaced in place by:
  - the label "In your own words" (15 px, `--text-muted`);
  - Field's `Textarea`, focused at once;
  - a row with "Tell Bower" (primary sm, disabled while the text is empty after trimming) and "Cancel" (ghost sm), which brings the options back and returns focus to "Something else…".
- **Length:** no counter and no `maxLength`. Above 1,000 characters after trimming, "Tell Bower" is disabled and Field's error line says "Use 1,000 characters at most." (`errorId`, `aria-invalid`).
- **One source:** an answer removes the card on Home and in the tidy sheet together.
- **Answering:** through the same `answerQuestion` and answer loop. The card goes, and focus moves as today: to the next question, or to the heading. The toast is today's `answerToast(outcome, label)`; the label is the option's label, or "your words" for text, so it reads `You chose "your words". …`. No new toast copy.

## Q-UI-2. The same card in the tidy sheet (TidySheet.tsx, RunView)

- **Where:** while a run is live, RunView renders the `Questions` card for this run's questions, between `runDetail` and the steps. It sits under a label "Bower has a question", using the `runStyles.linksLabel` style that RunLinks uses. The card's ground in the sheet is `--bg`, so it stands out on the sheet's `--bg-alt`.
- **How many:** only the first question shows: the earliest asked in this run. With more, a link "N more questions on Home" (N counts this run's other unanswered questions) (`plural(n, 'more question')` + " on Home") goes to Home and closes the sheet.
- **After an answer during the run:** the card goes (when it was the last, focus moves to the sheet's title, tabIndex -1), and the toast is today's `waits` outcome copy: "You chose "…". Bower will do this as soon as the current tidy-up ends." There is no new status block, and the steps and clock stay as today.
- **Done sheet:** today's `runDetail` already says "… and 1 question for you". A question still unanswered keeps its card, under the same label, above RunLinks. Answering there gives today's `answeredNow`. Closing the sheet leaves it on Home as today.
- **Phone:** the same, in today's bottom sheet, which scrolls (92dvh).

## Q-UI-3. The sheet stays inside the window on desktop (one home: `.sheet` in ui.module.css)

- Today the desktop sheet is placed at `top: 12vh` with `max-height: 92dvh`, so a tall sheet runs past the bottom of the window.
- In the `@media (min-width: 900px)` `.sheet` rule, set `max-height: calc(100dvh - 12vh - 24px)`. Its existing `overflow: auto` then scrolls the body. This applies to every sheet; no other change.

## Q-UI-4. Inbox row and pile page (Home inbox rows, PileScreen)

- **While a question about the pile waits:** the row's second line (today "4 things, today 07:31") reads "Waiting for your answer" in `--accent-line`. No pill, no icon.
- **After 2 rounds with no place:** the second line reads "Bower couldn't place this" in `--text-muted`. The pile page shows, under its heading meta, a plain paragraph (17 px, `--text`): "Bower couldn't place this. Tell it more in the pile's words, or move it yourself." No new buttons, since the words field and Move are already on that page.
- **Unchanged:** the run chip, the right panel (which already lists questions with "Answer on Home") and the confirm sheet.

## What the person sees: rows to test

| Situation | What shows |
| --- | --- |
| A question with options on Home | The stacked ghost buttons and "Something else…" (inbox and pile questions only). |
| A yes/no question about an inbox thing or pile | Today's yes/no row, with "Something else…" below it at full width. |
| "Something else…" pressed | "In your own words", the focused Textarea, "Tell Bower" (disabled while empty) and "Cancel". |
| Cancel | The options come back; focus is on "Something else…". |
| An answer on Home, no run live | The card goes; today's `answeredNow` toast. |
| A question during the run, sheet open | The label "Bower has a question" and the card above the steps; "N more questions on Home" when there are more. |
| An answer during the run | The card goes; today's `waits` toast, shown once the sheet closes (messages wait while a sheet is open, 2026-10-11). |
| The run ends with a question unanswered | Done sheet: today's "… and 1 question for you", and the card above RunLinks. |
| The pile row while a question waits | "Waiting for your answer" in accent-line. |
| After 2 rounds | Row: "Bower couldn't place this" (muted). Pile page: the full sentence as a plain line. |
| Over 1,000 characters typed | "Tell Bower" disabled; the error line "Use 1,000 characters at most." |
| The last card in the sheet answered | Focus on the sheet's title. |
| An answer in the sheet | The same card is gone from Home too. |
| A tall sheet on a 1280×720 desktop | The sheet stays inside the window and scrolls. |

Accessibility: every control is a real button, with targets at least 44 px on coarse pointers (today's sm rule). The Textarea is labelled "In your own words". Focus moves as listed. Axe runs at WCAG 2.2 on Home and the sheet, on demo and fake, at 375 and 1440.
