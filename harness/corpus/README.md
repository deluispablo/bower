# Capability corpus (P4-A)

Made-up cases for the capabilities C04 to C11, C13 and C15 (Alex, Larkspur Lane, Saltmere, Ferrowick; nothing personal). Each folder holds:

- `case.json`: the inputs (piles, requests, rules, answers, seeded questions), the scope and the web switch;
- `inbox/`: the files of the piles; `folder/`: the starting folder (notes with their front matter, `Rules.md`);
- `expected.json`: structural outcomes, scored by `runner/src/corpus.ts` (`*` in a path matches any run of characters);
- `rubric.md`: what a good semantic result looks like, for the quality reviewer.

`covers: scripted` means the scripted provider produces the expected outcome today (the runner test runs and scores each); `model` cases wait for the P4 slices and their expectations are by hand. The five `bench-*` cases are the original app's `agent/bench/cases`, copied unchanged, and are the speed-baseline cases (`docs/harness/p4-speed-baseline.md`). The bench cases start from `_bench-vault/`, the original's `agent/bench/vault` copied unchanged (original layout, `0-Inbox` and so on). Cases marked `bench:` in their source are adapted from them (made-up names and dates).

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| bench-1-job-offer-clipping | C06 | model (speed baseline) | bench:1-job-offer-clipping (unchanged copy) |
| bench-2-text-pdf | C04 | model (speed baseline) | bench:2-text-pdf (unchanged copy) |
| bench-3-receipt-pdf | C04 | model (speed baseline) | bench:3-receipt-pdf (unchanged copy) |
| bench-4-scanned-pdf | C15 | model (speed baseline) | bench:4-scanned-pdf (unchanged copy) |
| bench-5-question-about-filed-pdf | C09 | model (speed baseline) | bench:5-question-about-filed-pdf (unchanged copy) |
| c04-garden-newsletter | C04 | model | bench:2-text-pdf, adapted (made-up garden and dates; the original PDF is in bench-2-text-pdf) |
| c04-hardware-receipt | C04 | model | bench:3-receipt-pdf, adapted (made-up shop; the original PDF is in bench-3-receipt-pdf) |
| c04-offer-and-flat | C04 | scripted | p2-journey:C04, the demo's first pile; the two hub notes it updates are in the starting folder |
| c05-confirms-known-fact | C05 | model | new (TL-P4-08 point 2: the value gate makes no note for a known fact) |
| c05-hub-lines | C05 | scripted | p2-journey:C05, the hub lines of the same press as C04 |
| c05-keep-one-note | C05 | model | p2-journey:C05 (fake only today: the merge question q1) |
| c05-line-not-repeated | C05 | scripted | p2-journey:C05 (idempotence: the same line twice is written once) |
| c05-person-edited-between-runs | C05 | scripted | new (scripted intent replies through the planner) |
| c05-merge-question-first | C05 | scripted | new (scripted intent replies through the planner) |
| c05-merge-answer-no | C05 | scripted | new (scripted intent replies through the planner) |
| c06-clipping-compared | C06 | model | bench:1-job-offer-clipping, adapted (made-up company; the original is in bench-1-job-offer-clipping) |
| c06-offer-and-listing-linked | C06 | scripted | p2-journey:C06 |
| c07-answer-yes | C07 | scripted | p2-journey:C07 (the answer run) |
| c07-rent-disagrees | C07 | scripted | p2-journey:C07 (a words-only pile) |
| c08-compare-flats | C08 | scripted | p2-journey:C08 |
| c08-revise-comparison | C08 | model | new (no revision path is scripted) |
| c08-report-with-sources | C08 | model | new (C08 prep; report through the existing thing.note boundary) |
| c08-compare-missing-fact | C08 | model | new (C08 prep; comparison with a missing deposit and trade-off prose) |
| c08-revise-keeps-personal-text | C08 | model | new (C08 prep; same-document revision, personal text and history) |
| c09-burst-pipe | C09 | model | bench:5-question-about-filed-pdf, adapted (made-up policy; the original is in bench-5-question-about-filed-pdf) |
| c09-closest-flat | C09 | scripted | p2-journey:C09 |
| c10-lookup-fails | C10 | model | new (failed and stale lookups are not scripted) |
| c10-web-allowed | C10 | scripted | p2-journey:C10 (allowed) |
| c10-web-denied | C10 | scripted | p2-journey:C10 (denied) |
| c11-ambiguous-stays | C11 | scripted | new (TL-P4-08 point 1: an unclear pile stays in the inbox with a question) |
| c11-document-is-not-policy | C11 | scripted | p2-journey:C11 (no policy change from a document) |
| c11-rule-worded | C11 | scripted | p2-journey:C11 (rules) |
| c11-saltmere-question | C11 | scripted | p2-journey:C11 (question lifecycle) |
| c13-undo-protects-edit | C13 | model | new |
| c13-undo-whole-run | C13 | model | new |
| c15-more-context-bounded | C15 | model | new |
| c15-scanned-letter | C15 | model | bench:4-scanned-pdf, adapted (made-up; the original is in bench-4-scanned-pdf) |
| c05-conflicting-fact-kept | C05 | scripted | new (preservation through the existing planner) |
| c05-marked-state-keeps-history | C05 | scripted | new (preservation through the existing planner) |

`replies.json` supplies deterministic intent replies at the existing Claude provider boundary. `$file:NAME` binds an exact admitted name to its id. `between` edits or moves run on the same fake Drive between two production runner calls; an empty array runs twice without a personal edit. Existing cases keep their demo-provider path.
