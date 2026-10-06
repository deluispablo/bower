# P2 phone/desktop evaluation at 4d7ab08

Sonnet evaluator (TL-P2-46 §4, general-purpose agent with model pinned), production build on port 5196, packet [2026-10-06-p2-evaluation-packet.md](2026-10-06-p2-evaluation-packet.md). Cells: FD fake desktop 1440×900, FP fake phone 390×844, DD demo desktop, DP demo phone. Full screenshots were kept outside the repo; the two finding screenshots are in [evidence/p2-eval-4d7ab08](evidence/p2-eval-4d7ab08/). Same SHA: `pnpm e2e:pwa` 4/4 passed (log `/private/tmp/p2-freeze-e2e-pwa.log`).

| Row | FD | FP | DD | DP |
| --- | --- | --- | --- | --- |
| C01 | pass | pass | NOT RUN | NOT RUN |
| C02 | pass | pass | pass | pass |
| C03 | pass | pass | pass | pass |
| C04 | pass | pass | pass | pass |
| C05 | pass | pass | pass | pass |
| C06 | pass | NOT RUN | NOT RUN | NOT RUN |
| C07 | pass | pass | NOT RUN | NOT RUN |
| C08 | pass | pass | partial | partial |
| C09 | pass | pass | pass | pass |
| C10 | pass | pass | partial | NOT RUN |
| C11 | pass | pass | partial | partial |
| C12 | pass | pass | pass | pass |
| C14 | pass | pass | pass | pass |
| C16 | FAIL (F1, F2) | FAIL (F1) | FAIL (F1) | FAIL (F1) |

C02: a reload mid-save kept the pile; unsent files ask to be chosen again and send once. C16: no horizontal overflow on phone, service worker active, manifest fine, one console error and it was expected (M2). Demo partials: the demo answers the comparison request with a generic "Done" (M6); the demo web-on path and C11 merge were not walked.

## Important (the one C/I round)

- **F1, all cells.** Home "Tidy-up finished" card → "Watch what Bower did" → Escape or Skip: the card is gone and focus is on `BODY`. The footer "Watch the last tidy-up" returns focus correctly.
- **F2, FD.** Keyboard Enter on Home "Add a pile", then on "Put the note in the inbox": focus is on `BODY` after each route change. Top-bar links keep focus.

## Minors (to P2_POLISH)

M1 sheets return focus to `main`, not the opener · M2 Try again on a pile with an unsent file logs a `BowerError` console error (person told what to do) · M3 fake: a reload within about 300 ms of "Your note is in the inbox" loses the note (pretend Drive saves 260 ms later) · M4 fake runner: after renaming Flat 7, "Compare the flats" and the Ferrowick question answer a generic "Done" · M5 fake: answering "Yes, £1,550" adds a timeline line but the Rent property stays £1,450 · M6 demo: "Compare the flats on the shortlist" answers a generic "Done" with no link · M7 phone: inline links 26 px, Files toolbar and Settings switches 30–32 px, the comparison header wraps "Commute" · M8 the "Tell Bower" page has no "do it now" after keeping a rule (it is on Home); the demo situations menu drops `source=fake` · M9 sign out leaves bookmarks, device and open-tab keys in localStorage · M10 preview says "16 things", the running sheet "Reading 15 things".

## NOT RUN

C01 on demo; confirming account deletion (dialog opened, cancelled); C06 on FP/DD/DP; C07 on demo; keyboard-only on phone; Bin restore other than the Undo toast. Out of scope (TL-P2-38): C08 revision, C10 failed and stale cases, C13, C15. The evaluator also opened `e2e/capabilities*.spec.ts` for selectors, outside its reading list.
