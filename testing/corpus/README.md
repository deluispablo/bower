# Capability corpus (P4-A)

Made-up cases for the capabilities C04 to C11, C13, C15 and C17 (Alex, Larkspur Lane, Saltmere, Ferrowick; nothing personal). Each folder holds:
Made-up cases for the capabilities C04 to C13 and C15 (Alex, Larkspur Lane, Saltmere, Ferrowick; nothing personal). Each folder holds:
Made-up cases for the capabilities C04 to C11, C13, C15 and proposed C17 / B1–B3 (Alex, Larkspur Lane, Saltmere, Ferrowick; nothing personal). Each folder holds:

- `case.json`: the inputs (piles, requests, rules, answers, seeded questions), the scope and the web switch;
- `inbox/`: the files of the piles; `folder/`: the starting folder (notes with their front matter, `Rules.md`);
- `expected.json`: structural outcomes, scored by `runner/src/corpus.ts` (`*` in a path matches any run of characters);
- `rubric.md`: what a good semantic result looks like, for the quality reviewer.

`covers: scripted` means the scripted provider produces the expected outcome today (the runner test runs and scores each); `model` cases wait for the P4 slices and their expectations are by hand. The five `bench-*` cases are the original app's `agent/bench/cases`, copied unchanged, and are the speed-baseline cases. The bench cases start from `_bench-vault/`, the original's `agent/bench/vault` copied unchanged (original layout, `0-Inbox` and so on). Cases marked `bench:` in their source are adapted from them (made-up names and dates).

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
| c06-stored-project-connection | C06 | model | new (C06 preparation; scripted intent proof pending) |
| c06-shared-name-unrelated | C06 | model | new (C06 preparation; scripted intent proof pending) |
| c06-two-sources-attributed | C06 | model | new (C06 preparation; scripted intent proof pending) |
| c07-answer-yes | C07 | scripted | p2-journey:C07 (the answer run) |
| c07-rent-disagrees | C07 | scripted | p2-journey:C07 (a words-only pile) |
| c07-same-period-rent | C07 | model | new (C07 prep; scripted intent proof pending) |
| c07-tentative-closure | C07 | model | new (C07 prep; scripted intent proof pending) |
| c07-dated-rent-change | C07 | model | new (C07 prep; scripted intent proof pending) |
| c08-compare-flats | C08 | scripted | p2-journey:C08 |
| c08-revise-comparison | C08 | model | new (no revision path is scripted) |
| c08-report-with-sources | C08 | model | new (C08 prep; report through the existing thing.note boundary) |
| c08-compare-missing-fact | C08 | model | new (C08 prep; comparison with a missing deposit and trade-off prose) |
| c08-revise-keeps-personal-text | C08 | model | new (C08 prep; same-document revision, personal text and history) |
| c09-burst-pipe | C09 | model | bench:5-question-about-filed-pdf, adapted (made-up policy; the original is in bench-5-question-about-filed-pdf) |
| c09-closest-flat | C09 | scripted | p2-journey:C09 |
| c10-fresh-result-cited | C10 | model | new (C10 prep; scripted proposals pending lookup harness proof) |
| c10-stale-result-withheld | C10 | model | new (C10 prep; scripted proposals pending lookup harness proof) |
| c10-denied-keeps-prior-result | C10 | model | new (C10 prep; scripted proposals pending lookup harness proof) |
| c09-original-over-summary | C09 | model | new (C09 prep: original over stale summary) |
| c09-two-source-answer | C09 | model | new (C09 prep: two sources, exact identities) |
| c09-not-in-sources | C09 | model | new (C09 prep: honest missing evidence) |
| c10-lookup-fails | C10 | model | new (failed and stale lookups are not scripted) |
| c10-web-allowed | C10 | scripted | p2-journey:C10 (allowed) |
| c10-web-denied | C10 | scripted | p2-journey:C10 (denied) |
| c11-ambiguous-stays | C11 | scripted | new (TL-P4-08 point 1: an unclear pile stays in the inbox with a question) |
| c11-document-is-not-policy | C11 | scripted | p2-journey:C11 (no policy change from a document) |
| c11-rule-worded | C11 | scripted | p2-journey:C11 (rules) |
| c11-saltmere-question | C11 | scripted | p2-journey:C11 (question lifecycle) |
| c11-source-cannot-override-rule | C11 | model | new (C11 preparation; scripted intent pending) |
| c11-request-is-one-time | C11 | model | new (C11 preparation; scripted intent pending) |
| c11-source-cannot-answer | C11 | model | new (C11 preparation; scripted intent pending) |
| c12-model-failure-retry | C12 | model | new (C12 preparation; scripted fault and lifecycle proof pending) |
| c12-tool-interruption-recovery | C12 | model | new (C12 preparation; scripted fault and lifecycle proof pending) |
| c12-text-budget-truthful | C12 | model | new (C12 preparation; scripted fault and lifecycle proof pending) |
| c13-undo-protects-edit | C13 | model | new |
| c13-undo-whole-run | C13 | model | new |
| c13-manifest-move-and-create | C13 | model | new (C13 prep; scripted manifest lifecycle proof pending) |
| c13-manifest-partial-edited-note | C13 | model | new (C13 prep; scripted manifest lifecycle proof pending) |
| c13-manifest-state-with-personal-edit | C13 | model | new (C13 prep; scripted manifest lifecycle proof pending) |
| c15-more-context-bounded | C15 | model | new |
| c15-scanned-letter | C15 | model | bench:4-scanned-pdf, adapted (made-up; the original is in bench-4-scanned-pdf) |
| c15-ready-package-reused | C15 | model | new (C15 preparation; scripted input and context proof pending) |
| c15-stale-package-rebuilt | C15 | model | new (C15 preparation; scripted input and context proof pending) |
| c15-context-budget-exhausted | C15 | model | new (C15 preparation; scripted input and context proof pending) |
| b1-index-job-offer | C17 / B1 | model | TL-P4-39; reused made-up B123 indexed job-search fixture; scripted proof pending |
| b1-changes-person-edit | C17 / B1 | model | TL-P4-39 §1.6, addendum 2; supported own-note edit on the same Drive |
| b1-moc-over-40 | C17 / B1 | model | TL-P4-38 addenda 1–2; 41-item parent folds to existing child maps |
| b1-index-no-change | C17 / B1 | model | TL-P4-39 F9; reused made-up B123 exclusions and unchanged-index fixture |
| c05-conflicting-fact-kept | C05 | scripted | new (preservation through the existing planner) |
| c05-marked-state-keeps-history | C05 | scripted | new (preservation through the existing planner) |
| c17-b56-personal-sale-project | C17 B5/B6 | model | new (TL-P4-38 personal-sale project fit; scripted intent pending) |
| c17-b56-cv-profile | C17 B5 | model | new (TL-P4-38 CV originals and C05 profile update; scripted intent pending) |
| c17-b56-offer-job-search | C17 B5/B6 | model | new (TL-P4-38 offer before generic project material; scripted intent pending) |
| c17-b56-clear-topic-templates | C17 B6 | model | new (TL-P4-38 clear topic with Source, Concept and MOC; contract and scripted intent pending) |

The C17 B5/B6 cases are preparation fixtures for lead review, all `covers: model`.
C17 is not yet registered in the capability union or the method-test id filter; general
loading and grounding checks still read these cases. Their type tables are synthetic
mechanism specimens, not an approved stored-row grammar. Exact top-three intent replies
and outstanding contract/driver decisions live in the B56 prep notes.
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
With neither, a later press keeps the old fresh-request default (`press-N`, "Update these notes."). A replay restores the
exact original active or archived request journal record, retaining its id and words. A new tidy-up has a fresh id.
`CaseRun.requests` records the request ids and words actually admitted, so tests can distinguish those inputs.
`CaseRun.requestAction` reports a later request's kind and id. For a replay, `outcome: "already-active"` means the
original record was still waiting and nothing was written; `outcome: "restored"` means the archived record was written
back to the active journal. `kind: "tidy"` means a new request was written. First and answer presses have no request action.
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

The four `b1-*` cases are preparation fixtures, not scripted success. Their execution replies use the existing intent
shape; B1 needs a step-aware driver, changes-feed simulation and context/read/write oracles before coverage can change.
The current C04–C15 method test does not select `b1-*` ids or admit C17. See the B1 prep notes.

The four `b23-*` cases are pending B2/B3 preparation fixtures, with exact execution replies and existing scored keys.
They need C17 admission, scalar/context/maintenance oracles and B1’s step-aware driver before scripted acceptance.
See the B23 prep notes; hot is hidden maintenance, not authoritative pending state.

The three `c17-b4-*` cases use the landed ledger grammar, About me's learned regions and the memory reply keys
(b4c-fixtures); `runner/test/b4c-fixtures.test.ts` runs them through production main. Seeded history uses made-up
ids that are never admitted. Case 4 (own text deletion) was dropped (TL-P4-48 Q3). Internal archives stay under
`.bower/` (TL-P4-45); the gate case's consolidation oracle is completed by b4c-consolidation.

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b4-forget-no-return | C17 / B4 | model | TL-P4-39; F4: trusted Forget by quote, one tombstone, no return from the same source or an archive |
| c17-b4-origin-not-authority | C17 / B4 | model | TL-P4-39; F7: qualified person preference versus instruction-shaped offer; a document-sourced preference is refused |
| c17-b4-gate-archive-first | C17 / B4 | model | TL-P4-39; F4: over-budget gate at four/five; words added between presses; consolidation stage pending |

## B11 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b11-skills-tally | C17 / B11 | model | TL-P4-39 F13/R5/R7; active typed skills tally; pending scripted production proof |
| c17-b11-monthly-money | C17 / B11 | model | TL-P4-39 F13; monthly money partition, missing/invalid amounts; pending proof |
| c17-b11-flat-formulas | C17 / B11 | model | TL-P4-39 F13/R5; raw formulas, unavailable divisor, personal exception; pending Q7 |
| c17-b11-proposal-authority | C17 / B11 | model | TL-P4-39 F5/F7; suggestion survives filing/ignore, document is not authority |

All four remain preparation fixtures. Proposed `replies.json` extends the future B11
execution reply; today's strict schema rejects `views`. Request/note/folder selectors
need the existing driver's step-aware extension. Type-table field spelling is a pending
B5a specimen, not a second production format. `expected-view-results.json` is a separate
hand-computed oracle, outside model input and not scored today. C17 registration and
verdict selection remain upstream H1 work. See the B11 prep notes.

## B7 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b7-reuse-known | C17 / B7 | model | TL-P4-39 B7; three existing topics on a new note, no vocabulary write |
| c17-b7-proposal-yes | C17 / B7 | model | TL-P4-39 F5/U2; frozen tag consent after filing, no source backfill |
| c17-b7-proposal-budget | C17 / B7 | model | TL-P4-47 shared proposal cap/order; duplicate dedup and pending third candidate |
| c17-b7-authority-full-cap | C17 / B7 | model | TL-P4-39 F7/R2; thirty tags, document injection and personal Markdown preservation |

All four are pending preparation fixtures, not scripted success. Proposed note.tags
and tagProposals reply fields are rejected today. Case 2's $proposal:rainwater selector
needs exact generated proposal/asking binding in the existing real-answer driver;
it is neither a live id nor a supported selector yet. expected-tag-results.json is
an independent future oracle outside folder/inbox and model input, not a second
registry or scored key. C17 admission/verdict filtering, step-aware calls and parsed
payload/tag/raw-byte/send oracles remain upstream support plus B7c work. The prep
records seven contract questions; no runtime or app changes are made.
See the B7 prep notes.

## B8 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b8-settled-recovery | C17 / B8 | model | TL-P4-39 F3/U3; rejected edit, lost log response and real health row; pending fault proof |
| c17-b8-report-only-grammar | C17 / B8 | model | TL-P4-39 B8; links outside fences, orphan, missing summary and tag overflow; personal bytes protected |
| c17-b8-bounded-encoding | C17 / B8 | model | TL-P4-39 F14; delimiter-rich name and lossless same-year seal at 1024 events; pending codec/rotation proof |
| c17-b8-findings-refresh | C17 / B8 | model | TL-P4-41 feed/cache; supported personal edit clears a finding, third check has no health write |

All four are pending preparation fixtures, not scripted success. `replies.json` uses
the existing execution intent: the model never returns log lines or lint findings.
`oracle.json` is a review/test specification outside model input, not a supported
case key or a scorer extension. Case 1's expected state requires the described fault
and same-run redispatch; ordinary `presses` do not inject that fault. Case 3's seeded
log is a proposed bounded-format specimen, not an accepted stored grammar. B7 owns
the allowed-tag codec; case 2 pins only the already ruled three-tag cap. C17/verdict
admission, real finding sets, field decoding, write traces and recovery still need
the shared driver/scorer handoff. See the B8 prep notes.

## B9 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b9-contradiction-two-sources | C17 / B9 | model | TL-P4-39 B9/U6; one plain contradiction entry, both original links, old history retained |
| c17-b9-uncertain-and-inferred | C17 / B9 | model | TL-P4-39 B9/U6; explicit uncertainty and qualified inference, no asserted cancellation |
| c17-b9-legacy-readable | C17 / B9 | model | TL-P4-39 B9/U6; old and unknown marker text remains literal, no note migration |
| c17-b9-person-list-kept | C17 / B9 | model | c05-timeline-list + TL-P4-32/-42; one personal byte append, star/CRLF and replay preserved |

All four are pending preparations, not scripted success. Top-two `replies.json` objects
propose bounded `marker`/`alsoCites` execution fields that today's strict schema rejects;
existing source selectors still bind by exact admitted name. Case 3's empty reply and
case 4's ordinary append reply use the existing intent shape, but stronger reader/DOM,
source-id, exact-byte, dedup and same-run recovery evidence remains required. Case 4
builds on the separately landing c05-timeline-list ruling; it does not reinstate strict
parsing of the person's earlier bullets. All outcomes use existing Expected keys.
C17 registration/verdict selection is shared upstream H1 work; current passing tests
do not execute these model cases. See the B9 prep notes for the
compatible plain-text storage recommendation, six lead questions and exact file ledger.

## B12 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b12-shared-target | C17 / B12 | model | TL-P4-39 F11/F8/U4; two members contribute to one list edit, combined caps and full accounting |
| c17-b12-closed-ops | C17 / B12 | model | TL-P4-39 class F; move/rename/property/tag, dependent edit/move and shared mechanical link consequences |
| c17-b12-large-first-part | C17 / B12 | model | TL-P4-39 addenda 2–3, TL-P4-44 Q4; 201→200 yes, late arrival exclusion and new rest with 30-day skipping |
| c17-b12-authority-person-boundary | C17 / B12 | model | TL-P4-39 F7/R2; private workers, no person/Source metadata and honest unavailable member |

All four are pending preparation fixtures, not scripted success. `maps` is a proposed
closed execution arm rejected by today's provider. `$request:`, `$set:`, `$note:`,
`$folder:` and `$question:` need exact id/asking binding in the shared driver; only
`$file:NAME` works today. Case 3's `$script:*` result-array recipes need deterministic
expansion from stored members, not a production string result. Its late-arrival.txt
is outside folder/inbox/model input and is inserted by a future fault/press oracle
after the question persists; today's between format cannot add a file. Case 2 needs
id-based byte comparison across moved paths and explicit primary-edit→move evidence.
`oracle.json` and `inventory.json` are independent evidence/allocation specifications,
never production stores, model input or new scored case fields. C17 registration,
verdict selection, named model stages, shared budget/receipt and whole-request oracles
remain required. See the B12 prep notes for the exact top-two replies,
nine lead questions, binding rulings and serial file ledger.

## B10 preparation cases — 2026-10-10

| Case | Capability | Covers | Source |
| --- | --- | --- | --- |
| c17-b10-partial-pdf | C17 / B10 + C15 | model | TL-P4-39 F12; real three-page extraction cut below visible word threshold; pending coverage trace |
| c17-b10-complete-tail | C17 / B10 + C15 | model | TL-P4-39 F12/F7; complete tail deadline, original provenance and compatible cached synopsis; pending proof |
| c17-b10-shared-budget | C17 / B10 + C15 | model | TL-P4-39 F8; five long sources, partial introductions and paid retry in one aggregate budget |
| c17-b10-personal-original | C17 / B10 + C15 | model | TL-P4-32/-42 addendum 3; long personal Markdown moves with exact original bytes, no metadata rewrite |

All four remain pending preparation fixtures. Top-two replies.json arrays use the
existing terminal tidy-intent boundary; case 2 requires actual complete C15 evidence
before that reply can be grounded. oracle.json is a separate unscored specification,
not model input, a cache format or a supported case field. C15 owns preparation,
coverage/cache validity, context exchanges and limitation-score support; B10 extends
that one path. B1 owns named model stages and the aggregate run/request budget.
C17 registration/verdict selection, exact moved bytes/ids, cache/coverage traces and
model outcomes are not established by the current green corpus gate. See
the B10 prep notes for six questions, exact file handoffs and proposals.
