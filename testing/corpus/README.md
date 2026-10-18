# Capability corpus (P4-A)

Made-up cases for the capabilities C04 to C13 (C12 is the lifecycle: faults, interruption, waiting), C15 and C17 (Alex, Larkspur Lane, Saltmere, Ferrowick; nothing personal). Each folder holds:

- `case.json`: the inputs (piles, requests, rules, answers, seeded questions), the scope and the web switch;
- `inbox/`: the files of the piles; `folder/`: the starting folder (notes with their front matter, `Rules.md`);
- `expected.json`: structural outcomes, scored by `runner/src/corpus.ts` (`*` in a path matches any run of characters);
- `rubric.md`: what a good semantic result looks like, for the quality reviewer.

`covers` is each case's label in `case.json`, `scripted` or `model`, and the table repeats it. It does not say which test executes a case or whether a live model run passes; many `model` cases also score offline through scripted replies.

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c04-garden-newsletter | C04 | model | new (made-up garden and dates; a hand-built text PDF) |
| c04-hardware-receipt | C04 | model | new (made-up shop; a hand-built text PDF) |
| c04-offer-and-flat | C04 | scripted | p2-journey:C04, the demo's first pile; the two hub notes it updates are in the starting folder; the photo is a made-up plain JPEG with no metadata |
| c05-confirms-known-fact | C05 | model | new (TL-P4-08 point 2: the value gate makes no note for a known fact) |
| c05-hub-lines | C05 | scripted | p2-journey:C05, the hub lines of the same press as C04 |
| c05-keep-one-note | C05 | scripted | p2-journey:C05 (the merge question asked as a typed pair, answered yes, then a tidy-up with nothing new) |
| c05-line-not-repeated | C05 | scripted | p2-journey:C05 (idempotence: the same line twice is written once) |
| c05-person-edited-between-runs | C05 | scripted | new (scripted intent replies through the planner) |
| c05-merge-question-first | C05 | scripted | new (scripted intent replies through the planner) |
| c05-merge-answer-no | C05 | scripted | new (scripted intent replies through the planner) |
| c06-clipping-compared | C06 | scripted | bench:1-job-offer-clipping, adapted (made-up company) |
| c06-stored-project-connection | C06 | scripted | new (C06; the source note links both hubs with a reason) |
| c06-shared-name-unrelated | C06 | scripted | new (C06; one sourced line on the right Cedar note) |
| c06-two-sources-attributed | C06 | scripted | new (C06; one sourced line per project) |
| c07-answer-yes | C07 | scripted | p2-journey:C07 (the answer run) |
| c07-same-period-rent | C07 | scripted | new (C07; B9 contradiction and uncertain markers) |
| c07-tentative-closure | C07 | scripted | new (C07; B9 contradiction and uncertain markers) |
| c07-dated-rent-change | C07 | scripted | new (C07; B9 contradiction and uncertain markers) |
| c08-compare-flats | C08 | scripted | p2-journey:C08 |
| c08-report-with-sources | C08 | scripted | new (C08 prep; report through the existing thing.note boundary) |
| c08-compare-missing-fact | C08 | scripted | new (C08 prep; comparison with a missing deposit and trade-off prose) |
| c08-revise-keeps-personal-text | C08 | model | new (C08 prep; same-document revision, personal text and history) |
| c09-burst-pipe | C09 | scripted | bench:5-question-about-filed-pdf, adapted (made-up policy) |
| c09-closest-flat | C09 | scripted | p2-journey:C09 |
| c10-fresh-result-cited | C10 | model | new (C10 prep; scripted proposals pending lookup harness proof) |
| c10-stale-result-withheld | C10 | model | new (C10 prep; scripted proposals pending lookup harness proof) |
| c10-denied-keeps-prior-result | C10 | model | new (C10 prep; scripted proposals pending lookup harness proof) |
| c09-original-over-summary | C09 | scripted | new (C09 prep: original over stale summary) |
| c09-two-source-answer | C09 | scripted | new (C09 prep: two sources, exact identities) |
| c09-not-in-sources | C09 | scripted | new (C09 prep: honest missing evidence) |
| c10-lookup-fails | C10 | model | new (failed and stale lookups are not scripted) |
| c11-ambiguous-stays | C11 | scripted | new (TL-P4-08 point 1: an unclear pile stays in the inbox with a question) |
| c11-document-is-not-policy | C11 | scripted | p2-journey:C11 (no policy change from a document) |
| c11-rule-worded | C11 | scripted | p2-journey:C11 (rules) |
| c11-saltmere-question | C11 | scripted | p2-journey:C11 (question lifecycle) |
| c11-source-cannot-override-rule | C11 | model | new (C11 preparation; scripted intent pending) |
| c11-request-is-one-time | C11 | model | new (C11 preparation; scripted intent pending) |
| c11-source-cannot-answer | C11 | model | new (C11 preparation; scripted intent pending) |
| c12-model-failure-retry | C12 | model | new (C12 lifecycle; the test driver injects the faults) |
| c12-tool-interruption-recovery | C12 | model | new (C12 lifecycle; the test driver injects the faults) |
| c12-text-budget-truthful | C12 | model | new (C12 lifecycle; the test driver injects the faults) |
| c12-group-waits | C12 | model | new (C12 lifecycle; the test driver refuses the second group's reply) |
| c12-admission-waits | C12 | model | new (C12 lifecycle; the test shrinks the admission estimate to 2) |
| c13-manifest-move-and-create | C13 | model | new (C13 prep; scripted manifest lifecycle proof pending) |
| c13-manifest-partial-edited-note | C13 | model | new (C13 prep; scripted manifest lifecycle proof pending) |
| c13-manifest-state-with-personal-edit | C13 | model | new (C13 prep; scripted manifest lifecycle proof pending) |
| c15-short-pdfs-read-whole | C15 | model | new |
| c15-image-only-pdf-asked | C15 | model | new (made-up one-page image-only PDF with no text layer, rebuilt 2026-10-08) |
| c15-current-admitted-evidence | C15 | model | new (runner extraction of admitted source bytes) |
| c15-context-budget-exhausted | C15 | model | new (runner extraction of admitted source bytes) |
| b1-index-job-offer | C17 / B1 | model | TL-P4-39; reused made-up B123 indexed job-search fixture |
| b1-changes-person-edit | C17 / B1 | model | TL-P4-39 §1.6, addendum 2; supported own-note edit on the same Drive |
| b1-moc-over-40 | C17 / B1 | model | TL-P4-38 addenda 1–2; 41-item parent folds to existing child maps |
| b1-index-no-change | C17 / B1 | model | TL-P4-39 F9; reused made-up B123 exclusions and unchanged-index fixture |
| b1-maintenance-crash-resume | C05 | scripted | new (TL-P4-41 Q4/Q5/Q11; B1 prep case 6; fault injected by the B1a contract test) |
| c05-marked-state-keeps-history | C05 | scripted | new (preservation through the existing planner) |
| c05-note-not-written-by-bower | C05 | scripted | new (C05 preservation through scripted intent replies and the existing planner) |
| c17-b56-personal-sale-project | C17 B5/B6 | model | new (TL-P4-38 personal-sale project fit; scripted intent pending) |
| c17-b56-cv-profile | C17 B5 | model | new (TL-P4-38 CV originals and C05 profile update; scripted intent pending) |
| c17-b56-offer-job-search | C17 B5/B6 | model | new (TL-P4-38 offer before generic project material; scripted intent pending) |
| c17-b56-clear-topic-templates | C17 B6 | model | new (TL-P4-38 clear topic with Source, Concept and MOC; contract and scripted intent pending) |
| b23-summary-person-lint | C17 / B2 | model | TL-P4-39 R2; quoted summary and personal-note preservation; B8 lint dependency |
| b23-hot-question-answer | C17 / B3 | model | TL-P4-39 F3; reused real generated question → app answer → hot settlement |
| b23-summary-words | C17 / B2 | model | TL-P4-39 B2; multiline words body and quoted scalar summary |
| b23-hot-evidence-only | C17 / B3 | model | TL-P4-39 §1.1/F7; instruction-only rebuild excludes unsupported prior-hot claims |

`replies.json` supplies deterministic intent replies at the existing Claude provider boundary. `$file:NAME` binds an exact admitted name to its id. `between` edits or moves run on the same fake Drive between two production runner calls; an empty array runs twice without a personal edit. Existing cases keep their demo-provider path.

Later presses can also use `case.json`'s additive `presses` array. Each item describes what happens after the previous
press and before the next production runner call. `between` remains the old two-press shorthand; use one form per case.
For example, after the first press asks about two notes:

```json
{
  "presses": [
    {
      "between": [
        {
          "kind": "answer",
          "question": { "kind": "pair", "notes": ["Projects/Garden plot.md", "Projects/Garden plot, second.md"] },
          "yes": true
        }
      ]
    },
    { "request": { "kind": "replay", "id": "change-1" } },
    { "request": { "kind": "tidy", "text": "Update these notes." } }
  ]
}
```

An answer selects exactly one question from the previous press, then submits its actual id through the app's
`answerQuestion` and `DriveVault.answer`, writing the same journal record that the next runner reads. `yes: true` / `false`
select the question's yes / no label (including "Write it" / "Keep mine"). Select by `{ "id": "QUESTION_ID" }`, a pair as
above, `{ "kind": "state", "note": "Projects/Garden plot.md" }`, an inbox subject's `path`, or `{ "kind": "folder" }`.
Note paths resolve through the Drive snapshot to typed subjects; no title or text substring chooses a question.
Missing or ambiguous selectors fail. Duplicate submissions use the app's existing once-only answer rule.

A yes that the app would run immediately schedules the next corpus press with the app's answer scope and request key;
the driver supplies the fake run-start port, while production admission, runner `main`, and all writes still run normally.
It adds no tidy-up request to that answer press. A no schedules no answer run; the next item is a separate tidy-up.
An explicit `request` and an automatically scheduled answer run need separate items.
With neither, a later press keeps the old fresh-request default (`press-N`, "Update these notes."). A replay redispatches the immutable run of that request id; it never restores archived journal bytes. `CaseRun.requests` records the request ids and words actually admitted. `CaseRun.requestAction` is `{ kind: "replay", id, outcome: "redispatched" }` for a replay and `{ kind: "tidy", id }` for a new tidy-up, which has a fresh id. First and answer presses have no request action.
A provider that leaves a request unanswered still leaves it waiting: the driver does not fabricate an outcome.

A press may also add the person's words first: `{ "kind": "words", "line": "…" }` makes one words pile in the Inbox,
`p-<press>-<n>`, where `n` counts only that press's `words` steps, from 1 in step order (edit, move and answer steps do
not count). A reply names it as `{ "source": { "pileId": "p-2-1" } }`.

`expected.json` can add one `runs` item per press, including the first. Top-level expectations still check the final press.
The driver returns `CaseRun.score` and exports `scoreCase(case, result)` for assertions over saved run snapshots.
The scripted corpus loop asserts this full driver score, so later-press, range, property and subject expectations all
count. `scoreCase` is the one home for these checks and calls the existing pure scorer for the shared substring checks;
existing single-run cases and the pure scorer are unchanged.

```json
{
  "runs": [
    { "report": { "questionsExactly": 1, "questionSubjects": [{ "kind": "state", "note": "Projects/Garden plot.md" }] } },
    { "report": { "questionsExactly": 0 }, "notes": [{ "path": "Projects/Garden plot.md", "timelineCount": 1 }] }
  ],
  "protectedRanges": [
    { "path": "Projects/Garden plot.md", "range": { "heading": "My thoughts" } },
    { "path": "Projects/Garden plot.md", "range": { "frontMatter": true } }
  ],
  "properties": [
    { "path": "Projects/Garden plot.md", "absent": ["by", "bower_state"], "equals": { "custom": "Alex" } }
  ]
}
```

`questionSubjects` accepts the same typed subjects as an answer selector (without an id selector).
When supplied, `questionSubjects`, a property's `absent` list and its `equals` map must be non-empty; an empty value
fails the case score, including inside a `runs` item. Omit a field when it makes no assertion.
Protected ranges compare raw UTF-8 bytes with the seeded note, preserving CRLF, spaces and Unicode. Front matter includes
its fences. The existing ownership parser supplies front matter and Bower section spans; other headings select a personal
ATX section through the next heading of equal or lesser depth, excluding headings in fenced code. Missing ranges fail;
repeated personal headings are ambiguous and fail. Properties are read directly from Drive appProperties, including empty
values: an absent property must have no key. A missing note fails even when all requested properties should be absent.
These expectations may also appear inside a `runs` item, where they compare that press with the original seeded note.

The three `c17-b4-*` cases use the landed ledger grammar, About me's learned regions and the memory reply keys
(b4c-fixtures); `runner/test/b4c-fixtures.test.ts` runs them through production main. Seeded history uses made-up
ids that are never admitted. Case 4 (own text deletion) was dropped (TL-P4-48 Q3). Internal archives stay under
`.bower/` (TL-P4-45); the gate case's consolidation oracle is completed by b4c-consolidation.

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b4-forget-no-return | C17 / B4 | model | TL-P4-39; F4: trusted Forget by quote, one tombstone, no return from the same source or an archive |
| c17-b4-origin-not-authority | C17 / B4 | model | TL-P4-39; F7: qualified person preference versus instruction-shaped offer; a document-sourced preference, sensitive fact, rule or schema is refused by the origin rule |
| c17-b4-gate-archive-first | C17 / B4 | model | TL-P4-39; F4: over-budget gate at four/five; words added between presses; press 2 archives the section first, then consolidates |

## B11 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b11-skills-tally | C17 / B11 | model | TL-P4-39 F13/R5/R7; active typed skills tally; installed and computed through main |
| c17-b11-monthly-money | C17 / B11 | model | TL-P4-39 F13; monthly money partition, missing/invalid amounts; installed and computed through main |
| c17-b11-flat-formulas | C17 / B11 | model | TL-P4-39 F13/R5; raw formulas, unavailable divisor, personal exception; installed with one column and computed through main |
| c17-b11-proposal-authority | C17 / B11 | model | TL-P4-39 F5/F7; suggestion survives filing/ignore, document is not authority; asked as a B5 proposal through main |

All four have landed: each `replies.json` uses the landed `views` grammar, bound by the
driver's request, note and folder selectors, and runs through main. The hand oracles live
in the runner's B11 tests; no computed number is seeded in `expected.json`. C17
registration and verdict selection remain upstream H1 work. See the B11 prep notes.

## B7 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b7-reuse-known | C17 / B7 | model | TL-P4-39 B7; three existing topics on a new note, no vocabulary write |
| c17-b7-proposal-yes | C17 / B7 | model | TL-P4-39 F5/U2; frozen tag consent after filing, no source backfill |
| c17-b7-proposal-budget | C17 / B7 | model | TL-P4-47 shared proposal cap/order; duplicate dedup and pending third candidate |
| c17-b7-authority-full-cap | C17 / B7 | model | TL-P4-39 F7/R2; thirty tags, document injection and personal Markdown preservation |

## B8 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b8-settled-recovery | C17 / B8 | model | TL-P4-39 F3/U3; rejected edit, lost log response and real health row; pending fault proof |
| c17-b8-report-only-grammar | C17 / B8 | model | TL-P4-39 B8; links outside fences, orphan, missing summary and tag overflow; personal bytes protected |
| c17-b8-bounded-encoding | C17 / B8 | model | TL-P4-39 F14; delimiter-rich name in the monthly log |
| c17-b8-findings-refresh | C17 / B8 | model | TL-P4-41 feed/cache; supported personal edit clears a finding, third check has no health write |

## B9 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b9-uncertain-and-inferred | C17 / B9 | model | TL-P4-39 B9/U6; explicit uncertainty and qualified inference, no asserted cancellation |
| c17-b9-person-list-kept | C17 / B9 | model | c05-timeline-list + TL-P4-32/-42; one personal byte append, star/CRLF and replay preserved |

## B12 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b12-shared-target | C17 / B12 | model | TL-P4-39 F11/F8/U4; two members contribute to one list edit, combined caps; its result note accounts for both |
| c17-b12-closed-ops | C17 / B12 | model | TL-P4-39 class F; move/rename/property/tag, dependent edit/move and shared mechanical link consequences; the result note lists final names |
| c17-b12-large-first-part | C17 / B12 | model | TL-P4-39 addenda 2–3, TL-P4-44 Q4; 201→200 yes with no model call, the late arrival left out, Reading 201 listed as not included; then "now the rest" as a new request that skips the 200 recent results (b12-recent) |
| c17-b12-authority-person-boundary | C17 / B12 | model | TL-P4-39 F7/R2; no person/Source metadata, one done and one unavailable member in the result note |

All four are landed (b12-result-note, b12-large-part): their
replies use `maps` with a `title` and a `set` whose folder is a `$folder:` selector, the
type tables hold valid stored rows, and each runs through main with two model calls and
scores clean, its result note `Request - <title>.md` and the health note in the report's
created rows. Their hand `oracle.json` and `inventory.json` are gone: the oracles live in
`runner/test/b12-*.test.ts`. `c17-b12-large-first-part` asks with one rule for all (one model
reply, on its second press: the first reads the 201 notes in, cold-discovery-progress), then a `create` between step adds the late arrival and a yes (the `request` question
subject) writes the first part with no model call; a fourth press asks for the rest as a new request (its own reply, no question): it writes the two notes left, skips the 200 recent results and leaves the first result note as it was; every press is scored.

## B10 long-text cases — 2026-10-10

Each has scripted `replies.json` and scores through `main` (`runner/test/b10-corpus.test.ts`). A `{"kind": "synopsis", "name"}`
entry answers that long text's synopsis call (`$part:<phrase>` cites the first part holding the phrase); a text with no
entry gets an empty, refused synopsis. The execution turns skip these entries.

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b10-partial-pdf | C17 / B10 | model | TL-P4-39 F12; real three-page extraction cut below visible word threshold; no synopsis call |
| c17-b10-complete-tail | C17 / B10 | model | TL-P4-39 F12/F7; complete tail deadline cited by the one synopsis and grounded in the original; one synopsis call |
| c17-b10-shared-budget | C17 / B10 | model | TL-P4-39 F8; five long sources over their shares, partial introductions, no synopsis call |
| c17-b10-personal-original | C17 / B10 | model | TL-P4-32/-42 addendum 3; long personal Markdown moves with exact original bytes, no metadata rewrite; one read-only synopsis call |

## C15 admitted-input cases

The four `c15-*` cases have scripted `replies.json` and score through production `main` in
`runner/test/c15-corpus.test.ts`, with selection and execution only and no synopsis. The app supplies
the admission manifest; the runner extracts the current source bytes. In `c15-current-admitted-evidence`
the current source's venue line reaches the model and the filed source keeps its bytes. The packing guide
stays partial at the text limit. Both one-page PDFs in `c15-short-pdfs-read-whole` are shown whole, with
nothing cut, and each gets a source note. The image-only PDF in `c15-image-only-pdf-asked` has no text
layer; it stays in the inbox with one question, and nothing waits. Created-file expectations include the
first run's health note.

## C09 question cases

The five `c09-*` cases are scripted. Four have `replies.json` and score through production `main` in
`runner/test/c09-corpus.test.ts` with two model calls each: the reply's `answers` entry becomes the request's done row,
byte for byte, and nothing else is written but the first run's health note. `c09-closest-flat` keeps the demo
provider's answer. Each checks its answer per request, never `.bower/requests.json` as text, with two expectation keys:

- `answers`: per request, the done row in `.bower/requests.json` (read as JSON) whose text equals `request`: its `done` has every `contains`, no `excludes`, and its `[[links]]` resolve by the one name rule to exactly `links`, in order.
- `tables`: per note at `path`, exactly one GFM table outside fenced code whose header cells equal `header`, with body rows equal to `rows`, in order.

## C12 lifecycle cases

The five `c12-*` cases carry `replies.json` and score through production `main` in `runner/test/c12-corpus.test.ts`
(`c12-corpus-admit.test.ts` for the admission wait). The three one-press cases score as they are. The two new ones have
two presses: `expected.runs` holds one entry per press and the top level is the last press, so the inbox ends empty.

- Faults come from the test driver, never from a case: a failed or refused model call, a lost answer with Drive gone,
  and a group whose reply is refused twice on press 1.
- `c12-admission-waits` runs with an estimate of 2 things in the test (`ADMIT_THINGS` mocked), against 144 for real; the
  third pile waits untouched, counted in `report.waiting`, and the next press files it.
- A thing with text needs a note or a Timeline line citing it, so each thing in `c12-group-waits` has its own line.
- Waiting things stay in the inbox byte for byte, with their properties.
