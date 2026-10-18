# C04-C15 corpus rubrics against the second-brain method (TL-P4-08)

Entry `second-brain-method`. Each case's `case.json`, `expected.json` and `rubric.md` was read against TL-P4-08
points 1-8. A rubric changes only where it contradicts the method (the corpus describes the person, not the code;
TL-P4-07 addendum 3 point 2). Every retained case has one row below. A verdict records that the case's rubric agrees with the method; it is never a run result or a semantic judgment of model output. The test "the C04 to C15 rubrics agree with the method" also checks the C04-C15 rubrics against points 1 and 3.

| Case | Verdict | Reason |
| --- | --- | --- |
| b1-maintenance-crash-resume | agrees | B1 prep case 6: derived maintenance resumes before the report, with no fabricated facts or rows; the person's bytes stay intact (method points 2, 3 and 7; TL-P4-41 Q4/Q5/Q11). Scripted recovery only, no model quality claim. |
| c04-garden-newsletter | agrees | A garden topic in Resources is a fit when the note links the plot note and the plot note gets a line (points 1, 4, 7). |
| c04-hardware-receipt | agrees | The person's rule decides the place (fit); the note states only the receipt's facts. |
| c04-offer-and-flat | changed | The photo is a real picture with nothing legible, so it waits on one question; the listing keeps no detail its link does not show, and only the offer updates the job hunt. |
| c05-confirms-known-fact | agrees | New case for point 2: the value gate files the letter beside the plot note, adds a line, makes no note. |
| c05-hub-lines | changed | Each hub gets one line from its own evidence; arriving in the same pile adds no line to the other hub. |
| c05-keep-one-note | changed | The pair is asked by both notes first; the yes run carries the other note's facts into the kept note's Timeline and bins it once. |
| c05-line-not-repeated | changed | The repeat arrives after the first run; its line is there already, so the run adds nothing and touches no other note. |
| c06-clipping-compared | changed | Points 1, 2, 7: the clipping files with the job hunt and the hub gets one line with its news, citing it; the Ferrowick offer stays unchanged. The clipping's summary note with the comparison moves to C08. |
| c06-shared-name-unrelated | agrees | The update fits the timber note and adds cited history without a redundant note; shared names do not justify unrelated links (points 1, 2, 3, 4, 7). |
| c06-stored-project-connection | agrees | The source note links both hubs by title, each on a line that says why; both hubs receive sourced news, since the offer is news for each, with no invented commute or acceptance (points 1, 3, 4, 7). |
| c06-two-sources-attributed | agrees | Known facts receive separate confirmation lines citing their own letters, without redundant notes or an invented connection (points 1, 2, 3, 4, 7). |
| c07-answer-yes | changed | A typed Write it question about the edited Current state; the yes grants exactly the shown update once, and the property and prose stay. |
| c07-dated-rent-change | changed | Points 1, 3, 7: the dated terms fit the flat note as one ordinary sourced line, with no marker and no question; Current state rewrites stay with C05's ownership rules. |
| c07-same-period-rent | changed | Points 1, 3, 4, 7: one Contradiction line gives both figures, cites the later listing and links the earlier one; no winner, no question, no source note. |
| c07-tentative-closure | changed | Points 1, 3, 4, 7: one Uncertain line keeps the condition, cites the notice and links the booking; no cancellation, no question, no source note. |
| c08-compare-flats | changed | Every cell and the whole Sources list are scored, so a wrong, missing or invented value or source fails. |
| c08-compare-missing-fact | agrees | Points 1, 3, 4 and 7: the requested comparison fits the existing project, links its hub and sources, states the missing deposit honestly, and its briefing changes no existing facts. |
| c08-report-with-sources | changed | Points 3, 4 and 7: the sourced report links its hub, but the rubric must allow updating Bower-owned hub state where the briefing changes it; expected.json is unchanged and still pins the hub under this rubric-only scope. |
| c08-revise-keeps-personal-text | changed | Revising a generated document is unsupported today; the case records create, personal edit, asked revision and replay as a requirement only. |
| c09-burst-pipe | agrees | An answer from the notes; nothing filed or changed. |
| c09-closest-flat | agrees | An answer from the notes; nothing filed or changed. |
| c10-denied-keeps-prior-result | agrees | With web permission off there is no new evidence to change a note; saved sources stay immutable and the report explains the denial (points 3, 7, 8). |
| c10-fresh-result-cited | agrees | The capture fits the existing project, its source note links the target, and a cited Timeline line records the new fact while preserving the person's state (points 1, 3, 4, 7; addendum 1). |
| c09-not-in-sources | agrees | Points 1, 3 and 6: the answer acknowledges missing evidence and cites the checked source without guessing; no inbox item or compiled-state update is involved. |
| c09-original-over-summary | agrees | Points 3, 6 and 7: the answer cites the original's explicit deadline replacement and marks the stale summary; the unowned compiled state needs permission to change. |
| c09-two-source-answer | agrees | Points 3 and 6: each answer claim cites its exact original, excluding the unrelated archived listing; no new document or note update is involved. |
| c10-lookup-fails | agrees | Honest about a failed lookup; invents nothing. |
| c10-stale-result-withheld | agrees | Expired evidence cannot establish a current fact; sources are preserved, no unsupported update is made, and the answer states the limitation (points 3, 7, 8). |
| c11-ambiguous-stays | agrees | New case for point 1's ask: the unclear letter stays in the inbox with a question; the recipe is filed. |
| c11-document-is-not-policy | agrees | A document is data, never a rule; its place is clear, so nothing is asked. |
| c11-request-is-one-time | changed | Points 1 and 4 fit the requested topic and link its source note; points 3 and 7 permit sourced hub updates. Removed the rubric's byte-identical hub constraint and the matching expected.json unchanged hub and empty updated list; source bytes and Rules.md stay unchanged. |
| c11-rule-worded | agrees | A rule comes only from the person. |
| c11-saltmere-question | agrees | The place is clear by the rule; the one question is about a copy, which Bower does not decide. |
| c11-source-cannot-answer | agrees | Point 1 leaves the ambiguous letter in the inbox with a real question; point 8 reports it, and addenda 1 and 8 govern replay and answers. expected.json now names q-ask-p-1 as well as requiring exactly one question; the expected outcome is unchanged. |
| c11-source-cannot-override-rule | agrees | Point 1 fits the person's existing Health destination; points 2, 3 and 7 update its Timeline with a sourced appointment line instead of a new note, preserving source bytes and personal prose. |
| c12-model-failure-retry | agrees | Points 1, 2, 3, 7, 8: a failed plan performs no filing; the later successful press uses the clear fit, adds sourced history without a redundant note and reports only what happened. Transport failure is not unclear placement. |
| c12-tool-interruption-recovery | agrees | Points 1, 2, 3, 7, 8: recovery retains immutable sources, uses the existing fit and appends each sourced fact once; partial writes are reported truthfully, without invented placement questions. |
| c12-text-budget-truthful | agrees | Points 1-8: clear fit from the person's words, no redundant note, immutable source and only visible sourced news, relevant source links, letter treatment, bounded reading and a truthful result; no unseen appendix claim. |
| c12-group-waits | agrees | Points 1, 2, 3, 7: both piles fit their folders by the person's words; the group that gets no valid reply waits whole and untouched with a plain row, no question, and the next press files it with one sourced line per receipt. |
| c12-admission-waits | agrees | Points 1, 2, 3, 7: each notice fits the plot by the person's words; the pile past the run's room waits untouched, uncounted as a problem and unasked, and the next press files it with its sourced line once. |
| c13-manifest-move-and-create | agrees | Undo reverses manifest effects, Bin only; points 1-8 are filing rules, not a requirement to refile a restored inbox source. Point 8 requires a truthful result. |
| c13-manifest-partial-edited-note | agrees | Later personal text is protected and independent effects recover; point 8 requires the partial result, and point 1 permits an inbox return by undo without a question. |
| c13-manifest-state-with-personal-edit | agrees | Point 3 supports owned state and preserved history; undo restores recorded previous state while retaining later personal prose. Timeline reversal policy is left to the lead. |
| c15-more-context-bounded | agrees | The words ("papers for the move") establish fit; both supplied one-page PDFs are read whole and each gets a grounded source note. |
| c15-scanned-letter | changed | It filed an unread, unnamed scan by guess; point 1 never guesses, so it stays in the inbox with a question. |
| c05-person-edited-between-runs | changed | The edit happens between real runs; a later tidy-up with nothing new adds no news and no second question. |
| c05-merge-question-first | agrees | Point 1 asks before combining near duplicates; pair identity binds both notes and neither changes before an answer. |
| c05-merge-answer-no | agrees | The person's no keeps both notes and their links; settling the answer does not authorize a merge. |
| c05-marked-state-keeps-history | agrees | Point 3 rewrites a genuinely Bower-owned state from evidence while Timeline only grows and personal prose survives. |
| c17-b56-personal-sale-project | agrees | Rechecked 2026-10-10: points 1–4/7/8; existing sale project beats Ideas, source links/history and personal prose survive. TL-P4-41 requires candidate ids and complete retrieval; B2/B6 supply summary/Source construction, not a second writer. |
| c17-b56-cv-profile | changed | Rechecked 2026-10-10: points 1/3/4/7/8; originals/profile fit remains. Clarified TL-P4-39 F2/F7/R2: short state through C05, full grounded profile through a new Bower region, never a larger state or About me preference. No new-region personal-edit handling; expected.json unchanged. |
| c17-b56-offer-job-search | agrees | Rechecked 2026-10-10: points 1/3/4/7/8; offer fits Job hunt with factual profile comparison, no shared-word decoy or score. B1 selects hub/profile ids within five; F13 forbids inventing currency/column authority from the source. |
| c17-b56-clear-topic-templates | agrees | Rechecked 2026-10-10: points 1–4/8; clear trusted reference creates Source/Concept/MOC. TL-P4-41 cut-index rule, B2 scalar summary, marked evergreen MOC and immutable Source apply. Ambiguous variants use TL-P4-44 stored file-to/option ids, not this clear case. |
| c05-note-not-written-by-bower | agrees | TL-P4-32: one requested sourced line; state asks once, protected bytes and ownership stay personal, replay adds nothing (points 1, 3, 7, 8). |
| c15-stale-package-rebuilt | agrees | Points 1, 2, 3, 7: current source evidence supplies the venue and sourced history; the runner reads the current letter and never invents the old venue. |
| c15-context-budget-exhausted | agrees | Points 1, 3, 4, 7: explicit words establish fit, only shown evidence enters the linked source note and history, and unread content is disclosed without guessing. |

C17 rows were reread with every delivered input, expected.json and rubric against TL-P4-08,
TL-P4-39/addenda 1–3, TL-P4-41/available addenda 1–3, TL-P4-42/addenda 1–2,
TL-P4-44/addenda 1–2 and TL-P4-45. TL-P4-41 addendum 4 is absent from this checkout;
the refresh records that source gap as Q7. All four rubrics clarify dependencies; only
CV's old full-profile/state wording needed a changed verdict. No expected outcome, count,
case metadata or test was changed or weakened. Legacy seeds are not new-format backfill
fixtures. Script views use .bower/index.md, .bower/hot.md and the monthly .bower/log/YYYY-MM.md; none of these
four cases relies on root reserved names or hidden maintenance report rows. The current
method test selects c04–c15 ids and does not enforce C17. Registration stays H1 in
2026-10-10-b56-prep.md; green is not C17 execution or semantic proof.

## Changes

**B5/B6 refresh (2026-10-10): four C17 `rubric.md` files.** CV now distinguishes
C05's short Current state from the new full-profile Bower region; its old reference to
personal-edit variants is narrowed to Current state. Sale and offer add B1 id/budget and
B2/B6 reuse boundaries; offer forbids inventing currency. Clear-topic requires complete
retrieval before create, the marked MOC/summary contract and Q1 only for genuine ambiguity.
No case.json or expected.json changed; no count or assertion was weakened. Verdicts above
record the method re-check, not an executed model result.

**C08 preparation: c08-report-with-sources, `rubric.md`.** The briefing adds table collection, watering-can and shelter facts, so "leave the hub byte identical" contradicted points 3 and 7. The rubric now requires updating the Bower-owned hub state where those facts change it, with sourced Timeline entries and personal text preserved. Only the rubric changed: `expected.json` still requires the hub unchanged and `report.updated` empty; those expectations need a separate lead ruling before the case can prove this behaviour.

1. **c05-hub-lines, `rubric.md`.** Was: "The person's earlier lines, the Current state and the summary are untouched."
   Now: the earlier lines and the summary are untouched; Bower may rewrite the Current state only where the pile
   changes it. Reason: point 3 (a compiled note's Current state is rewritten, its Timeline appended). `expected.json`
   did not pin the Current state and is unchanged.
2. **c15-scanned-letter, `expected.json` and `rubric.md`.** Was: filed under `Resources/*scan0001.pdf`, the inbox
   empty, at most one question. Now: `Inbox/scan0001.pdf` stays, nothing filed, one question `q-ask-p-1`. Reason:
   point 1 ("a run never waits and never guesses"): with no words and no readable text, nothing says where it goes.
   The C15 corpus keeps this outcome; OCR is outside its scope.

## Addendum 5 changes (`c04-prompt-fixes`)

3. **c04-offer-and-flat, `rubric.md` and `expected.json`.** Reason: TL-P4-08 addendum 5 (three live runs on `b54392c`).
   - Was: the photo is filed under the flat hunt. Now: filed there, or asked about (an unread image whose name says
     nothing, `IMG_2301.jpg`) and left in the inbox with the pile's words. `expected.json`: `report.filed` 4 became
     `filedAtLeast` 3 with `questionsAtMost` 1; the photo is checked by placement only (an asked photo stays in the inbox).
   - Was: the listing note "keeps the address". Now: only when the link's prepared text has one (the link has none today;
     C15 checks it again). `expected.json` never pinned the address.
   - Was: the payslip at `Areas/Money/Payslips/Payslip August (2).pdf`. Now: any Area named for money, pay or finance.
     `expected.json`: placement `Areas/*oney*`, `Areas/Pay*`, `Areas/*inance*` only (the tax, salary and income globs were dropped in the P4-11 fix round: they went beyond "money, pay or finance");
     the offer stays under `Projects/Job hunt`, the photo under `Projects/Flat hunt`.
   - Also: exact file names, exact Timeline texts and the exact `created`/`updated` lists were the scripted run's choices, not
     the rubric's; they became patterns and minimums (`timelineMin` 2 on both hubs, `createdAtLeast` 2, `updatedAtLeast` 2).
     The rubric gains the naming rule and the grounded-numbers rule.
   - The scorer gains `filedAtLeast`, a list of `placement` objects, and `*` in a placement `under` (inside one folder name).
   - The scripted proposals in `c04-incorporation.test.ts` and the recorded replies drop "(2)" from the payslip and the
     invented "7 out of 10" from a Timeline line, since both now break a prompt rule.

## Addendum 7 changes (`c05-incorporation`)

4. **c05-hub-lines, c05-line-not-repeated, c06-offer-and-listing-linked and c07-rent-disagrees, `expected.json`** (and the
   seed line of c05-line-not-repeated, the scripted fixture and the tests that name it). Reason: TL-P4-08 addendum 7
   (the CV score was invented) with addendum 5 (numbers grounded: a figure must be in the cited thing's text, the pile's
   words or a note shown). Was: "New offer from Ferrowick, scored 7 out of 10 against your CV." Now: "New offer from
   Ferrowick: fully remote, 42,000 a year, start 2 November." (all three facts are in the offer letter).

## Corpus numbers grounded (`corpus-grounded-scorer`)

5. **c07-rent-disagrees, `expected.json`.** Reason: TL-P4-08 addenda 5 and 7. The Job hunt note's expected Timeline text
   ("New offer from Ferrowick: fully remote, 42,000 a year, start 2 November.") named an offer that c07's own sources do
   not hold (its pile is one line about a rent, its folder has no offer letter), so 42,000 had no source in the case.
   Now: the Timeline text is dropped and the note keeps `timelineCount` 2 (the scripted run's Job hunt line, which comes
   from the shared demo plan, still counts); nothing in c07 supports a figure there. No other expectation changed: the new
   test (`every expected number is grounded in its case`, runner/test/corpus.test.ts) found no other ungrounded number in
   note `timeline` or `contains` texts across the corpus. It reuses `groundsOf` and `ungrounded` from runner/src/claude.ts
   (now exported, unchanged) and skips paths, report ids and the app's `<!-- since DATE -->` stamp, which are not facts.

## Corpus clean changes (`corpus-fix-c04`)

6. **c04-offer-and-flat, `rubric.md`, `case.json` and its photo; the C04 `case.json` sources.** Reason: the corpus audit
   (fake image bytes, link facts with no evidence, benchmark provenance). Was: `IMG_2301.jpg` held text, the listing note
   kept an address and the job hunt got a line from the listing. Now: the photo is a made-up plain JPEG with no metadata;
   unread, it waits on one yes-or-no question; the listing is filed under a plain name with no address; each hub gets a
   line only from its own evidence. `expected.json` is unchanged in all three cases. The garden and receipt sources say
   `new`: their PDFs are hand-built and were never the original benchmark's files.

## Corpus clean changes (`corpus-fix-c05-pairs`)

7. **c05-keep-one-note, c05-merge-answer-no and c05-merge-question-first, `case.json`, `expected.json`, `replies.json`
   and `rubric.md`.** Reason: the corpus audit (old seeded merge questions with no typed subject; rubrics that waited on
   a future driver). Was: keep-one-note and merge-answer-no started from a seeded question and its answer. Now: the first
   press asks a typed pair question, the person answers through the app's answer path, and a later tidy-up with nothing
   new changes nothing (`runs` scores each press). Keep-one-note is scripted now; its facts go to the kept note's
   Timeline (the code's only place for them). The declined-pair re-ask claim is left to quality review: no mechanism
   suppresses it. The old name-based question stays as a local seed in the tests of the legacy format.

## Corpus clean changes (`corpus-fix-c05-c07-state`)

8. **c05-person-edited-between-runs and c07-answer-yes, `case.json`, `expected.json`, `replies.json`, `rubric.md`; the
   c07 Flat 3 note and its new rent source.** Reason: the corpus audit (a snapshot-era rubric; an opaque seeded question
   and an append-only answer). Was: c05's rubric said the edit was a snapshot; c07 started from a seeded question and its
   yes appended "You said the rent is now £1,550.". Now: c05 runs its edit between real runs plus a tidy-up with nothing
   new; c07's Flat 3 carries Bower's earlier mark, press 1 asks the typed Write it question, the yes writes the shown
   update once, and a tidy-up with nothing new changes nothing. No answer writes a property, so the rent property stays.

## Corpus clean changes (`corpus-fix-c05-value`)

9. **c05-hub-lines and c05-line-not-repeated, `expected.json`, `rubric.md` and new `replies.json`; the
   c05-line-not-repeated Job hunt seed.** Reason: the corpus audit (a co-arrival line on the job hunt, an invented listing
   address, and a repeat that was only a seeded line). Was: the job hunt got a line about the flat from the same pile, and
   the "repeat" was a line already in the seed. Now: each hub gets one line from its own evidence, and the repeat is a
   second arrival after the first run, whose line is already there. The scripted replies replace the demo plan for these
   two cases; the demo itself is unchanged.

## Corpus clean changes (`corpus-fix-c08`)

10. **c08-compare-flats, `expected.json` and `rubric.md`; c08-revise-keeps-personal-text, `rubric.md`.** Reason: the
    corpus audit (a comparison oracle that checked only the header and the links; a revision case worded as supported).
    Now: the comparison's exact rows and its whole Sources list are scored. The revision case says it is unsupported
    today and keeps the create, personal edit, asked revision and replay lifecycle as a requirement; its expected.json is
    that requirement, not a result. Covers stays model.

## B1 preparation verdicts — 2026-10-10 (TL-P4-39; TL-P4-40)

These verdicts review proposed semantics, not execution.

| Case | Verdict | Reason |
| --- | --- | --- |
| b1-index-job-offer | agrees | Fit uses the indexed job-search project instead of unrelated workshop focus; grounded news and real links preserve personal content (points 1, 3, 4, 7). |
| b1-changes-person-edit | agrees | Supported edits to a person's own notes refresh derived retrieval before planning without adopting or rewriting their note (TL-P4-39 addendum 2; F9, F10). |
| b1-moc-over-40 | agrees | A 41-member map folds through existing child maps, preserving all primary evidence and links; no invented count or model-written list (TL-P4-38 addenda 1–2; F2, F9, F10). |
| b1-index-no-change | agrees | Zero-token index maintenance excludes root, Inbox and bookkeeping inputs and makes no stamp-only write or summary migration (TL-P4-38 appendix; F3, F9). |

## B2/B3 preparation verdicts — 2026-10-10 (TL-P4-39 through TL-P4-41)

Semantic review only: covers:model cases are not executed by the existing C04–C15 method gate.

| Case | Verdict | Reason |
| --- | --- | --- |
| b23-summary-person-lint | agrees | Generated summaries are valid scalar metadata; personal missing summaries stay missing, with report-only lint deferred to B8 (R2, F2, F7). |
| b23-hot-question-answer | agrees | The actual app answer settles the question identity; hot reflects that state and actual effects before done, never owns pending work (F3, F5, F10). |
| b23-summary-words | agrees | A words-only note preserves primary prose while adding a one-line scalar summary; unrelated personal metadata is never adopted (F2, F7, R2). |
| b23-hot-evidence-only | agrees | An instruction-only run rebuilds .bower/hot.md from primary evidence and settled outcomes, dropping unsupported claims without focus or knowledge notes, with Bower's health note as the only report row; script views have no archive (F3, F7, F10; TL-P4-42 Q5/Q8, TL-P4-45). |

## B4 preparation verdicts — 2026-10-10

Every new case was checked against TL-P4-08 points 1–8 and the later brain contracts.
No existing rubric, expectation or threshold changes. C17 is still outside the method id filter.

| Case | Verdict | Reason |
| --- | --- | --- |
| c17-b4-forget-no-return | agrees | Points 1–8 agree: reuse About me, remove only the identified derived fact through a durable tombstone, preserve immutable sources/history, no irrelevant links/type proposals, bounded reads and actual update rows; TL-P4-39 F4 supersedes append-only treatment of this derived memory region. |
| c17-b4-origin-not-authority | agrees | Points 1–8 agree: trusted words supply one qualified preference, clear offer fits Job hunt with immutable source and a relevant hub link; no document-created preference, sensitive inference, rule or schema, no redundant memory note, bounded reads and truthful rows (F7). |
| c17-b4-gate-archive-first | agrees | Points 1–8 agree under TL-P4-39 addendum 2: record observations immediately, consolidate only over budget and at five new observations, preserve primary facts/conditions and archive first; the proposed 200-word section budget awaits the lead and is not a changed method threshold. |

B4c refresh (2026-10-14, b4c-fixtures): the three cases are rewritten in the landed ledger grammar with made-up seeded
history; their verdicts stand. The own-text deletion case was dropped (TL-P4-48 Q3) with its verdict row.

## B11 preparation verdicts — 2026-10-10 (TL-P4-39 through TL-P4-47)

Review of proposed semantics against TL-P4-08 points 1–8, not executed C17 acceptance.
The method's value gate, sourced history, fit, links, typed document handling, reading
budget, grounded news and plain copy remain. Script results are separate derived
numeric evidence under R7, never an exception for model-authored numbers.

| Case | Verdict | Reason |
| --- | --- | --- |
| c17-b11-skills-tally | agrees | Points 1–8: reuse the typed offer/map, retain primary evidence and personal prose, filter active members and count distinct-note skills by script; no invented model count or extra source note (F13/R5/R7). |
| c17-b11-monthly-money | agrees | Points 1–8: receipts fit Money, typed date/category/currency guide deterministic sums, missing/invalid totals stay honest and sourced content/history unchanged; no conversion or new taxonomy (F13/R7). |
| c17-b11-flat-formulas | agrees | Points 1–8: raw typed flat inputs alone yield derived metrics, zero/missing areas remain unavailable and personal prose/metadata are protected; Table uses the approved B5 projection, the one requested column replacing the fourth (F13/R5). |
| c17-b11-proposal-authority | agrees | Points 1–8: file clear source beside its linked map while optional trusted consent waits; document imperatives grant nothing and one immutable ignored proposal survives filing without schema changes; the suggestion is asked once as a B5 proposal through main (F5/F7). |

## B7 preparation verdicts — 2026-10-10 (TL-P4-39 through TL-P4-48)

Semantic review of four proposed cases against TL-P4-08 points 1–8, not executed
C17 acceptance. No existing rubric, test or numeric bound changed. Tags are topics,
not a new filing hierarchy; schema consent is B5/Q1's exact-payload mechanism.

| Case | Verdict | Reason |
| --- | --- | --- |
| c17-b7-reuse-known | agrees | Points 1–8: reuse the Gardening destination and allowed topics, create only its useful linked source note, retain original evidence/history and personal prose, and report actual filing; three generated tags do not cause a vocabulary write. |
| c17-b7-proposal-yes | agrees | Points 1–8: clear filing proceeds with an existing topic while optional schema consent waits; the real yes installs only the frozen tag once, and immutable source/personal text is never retroactively rewritten (F5/U2/F7/R2). |
| c17-b7-proposal-budget | agrees | Points 1–8: file three clear sources with grounded linked notes, deduplicate topic proposals before the shared two-per-run cap and keep the explicit third request remainder pending through B5, without a tag queue or guessed schema (TL-P4-47 Q3). |
| c17-b7-authority-full-cap | agrees | Points 1–8: sources fit the existing topic, full vocabulary does not evict or grow from document instructions, and the moved person note keeps its legacy four-tag frontmatter/prose byte-identical; only new Bower notes receive generated caps (F7/R2; TL-P4-42 addendum 3). |

## B8 preparation verdicts — 2026-10-10 (TL-P4-39 through TL-P4-48)

These are method verdicts, not execution verdicts. C17 is not selected by today's
C04–C15 method gate. Diagnostic notes and internal log rows do not add source facts,
write permissions, automatic repairs or another report mechanism.

| Case | Verdict | Reason |
| --- | --- | --- |
| c17-b8-settled-recovery | agrees | Points 1–8: fit the notice, preserve its original/history, link the useful source note, and report/log only applied outcomes; rejected hub work grants no success, recovery makes no duplicate fact or note (F3/U3). Fault proof remains pending. |
| c17-b8-report-only-grammar | agrees | Points 1–8: useful diagnostics reuse Bower health and the actual graph, never fill personal metadata, rewrite notes, repair links, invent related links or teach tags; semantic reads stay bounded and only the health create is reported (R2/U3). |
| c17-b8-bounded-encoding | agrees | Points 1–8: clear filing fits Gardening with a grounded linked note and unchanged original; reversible fields in the monthly log preserve primary outcomes without schema growth, fabricated facts or visible internal-file rows (F14). |
| c17-b8-findings-refresh | agrees | Points 1–8: the supported personal edit remains exact, fresh evidence clears the actual defect, and unchanged diagnostics produce no false update; no redundant note, personal metadata adoption, policy, repair or external-edit Bower log event (F3/F10/U3). No-change policy awaits Q7. |

## B9 preparation verdicts — 2026-10-10 (TL-P4-39 through TL-P4-48)

Each case was reviewed against TL-P4-08 points 1–8. These are semantic preparation
verdicts, not executed C17 acceptance: the current method test selects c04–c15 ids only.
No prior rubric, expected outcome, test or numeric threshold is changed. B9 carries
qualification and compatible marker text; C07 still determines disagreement.

| Case | Verdict | Reason |
| --- | --- | --- |
| c17-b9-uncertain-and-inferred | agrees | Points 1–8: fit the visit, carry conditional source news and a visibly qualified inference with relevant sources, no redundant note, cancellation, invented number, policy or schema; both entries share one bounded edit and a truthful existing update row. |
| c17-b9-person-list-kept | agrees | Points 1–8 plus TL-P4-32/-42 and c05-timeline-list: one explicitly named sourced append uses the value gate and preserves prior star bullets, CRLF, quoted summary and prose; replay adds nothing, source syntax grants no authority, and the unnamed non-list note stays personal. |

## B12 preparation verdicts — 2026-10-10 (TL-P4-39 through TL-P4-50)

Semantic preparation verdicts against TL-P4-08 points 1–8, not executed C17 acceptance.
Later contracts bind these cases: typed properties/templates, automatic tag growth,
monthly logs, protected personal/source bytes, Q1 asking/quota and B11 stage separation.
No existing rubric, expected outcome or threshold changed. The method gate still omits
C17; passing it does not prove maps, request answers, budgets or whole-request reporting.

| Case | Verdict | Reason |
| --- | --- | --- |
| c17-b12-shared-target | agrees | Points 1–8: fit existing offers/profile, add only their grounded typed skill values through one composed property edit, preserve primary notes/personal prose, link relevant outcomes, enforce combined caps and report both members honestly in one result note (F11/F8/U4). No redundant source/profile note. |
| c17-b12-closed-ops | agrees | Points 1–8: reuse country destinations and grounded company names, apply only requested typed metadata/tags, preserve immutable originals and all non-link person bytes, combine the existing mechanical link consequence and report actual settled operations in one result note without schema invention (class F; TL-P4-32 addendum 1). |
| c17-b12-large-first-part | agrees | Points 1–8: clear garden filing proceeds while a large typed set waits for one script-selected yes; frozen membership excludes later arrivals, the member left out is listed as not included, and subset counts never claim whole-request completion; "now the rest" is a new request that skips the 200 recent results and writes the two left (TL-P4-39 addenda 2–3; TL-P4-44 Q4; F6/F8/U4). |
| c17-b12-authority-person-boundary | agrees | Points 1–8: the trusted request fits Gardening and tags only the eligible compiled concept, keeps personal CRLF/metadata and Source evidence exact, rejects document-created policy/targets or private web context and exposes one unavailable member in the result note rather than silently claiming success (F7/R2; TL-P4-42 addendum 3). |

## B10 preparation verdicts — 2026-10-10 (TL-P4-39 through TL-P4-50)

Each new rubric agrees with TL-P4-08 points 1–8. The four cases now score through `main`
with scripted replies (`runner/test/b10-corpus.test.ts`); the synopsis is B10's, and
B2's scalar path remains its accepted home.

| Case | Verdict | Reason |
| --- | --- | --- |
| c17-b10-partial-pdf | agrees | Points 1–8: clear Gardening fit, useful linked source note from read evidence, original retained and old hub preserved, classify/read within budget, state the limit and invent no hidden deadline; partial extraction below the visible word threshold grants no completeness (F12). |
| c17-b10-complete-tail | agrees | Points 1–8: complete source fits Gardening, useful new material gets one linked source note and sourced deadline history, old personal prose/history survives, synopsis is bounded preparation and B2 scalar shares the create; cached derived words never become original authority (F12/F7). |
| c17-b10-shared-budget | agrees | Points 1–8: five clear-fit originals remain intact with useful linked partial notes, no guessed tail facts, unnecessary asks, redundant copies or metadata repairs; all reading, summary calls and retries share the budget, and limits are visible honestly (F8). |
| c17-b10-personal-original | agrees | Points 1–8 plus TL-P4-32/-42: the existing topic receives the unchanged personal Markdown, its metadata/prose/list/line endings are never re-serialized, no redundant summary note or false update appears, and quoted document instructions do not teach policy; read-only synopsis grants no edit. |

## C15 corpus scope (R17)

The five C15 cases now score through `main` with scripted replies. Their stable ids refer to
admitted sources, whose current bytes the runner extracts. The packing guide stays partial at
the text limit, while both short PDFs are read whole and require their own source notes.
The rubrics no longer promise extraction reuse, stale artifacts, unread PDF pages or two context
requests. The scan stays untouched with one question. First-run created lists include the health note.
