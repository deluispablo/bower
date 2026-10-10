# C04-C15 corpus rubrics against the second-brain method (TL-P4-08)

Entry `second-brain-method`. Each case's `case.json`, `expected.json` and `rubric.md` was read against TL-P4-08
points 1-8. A rubric changes only where it contradicts the method (the corpus describes the person, not the code;
TL-P4-07 addendum 3 point 2). The test "the C04 to C15 rubrics agree with the method" checks every row below.

| Case | Verdict | Reason |
| --- | --- | --- |
| c04-garden-newsletter | agrees | A garden topic in Resources is a fit when the note links the plot note and the plot note gets a line (points 1, 4, 7). |
| c04-hardware-receipt | agrees | The person's rule decides the place (fit); the note states only the receipt's facts. |
| c04-offer-and-flat | agrees | Each thing fits an existing project or a new Area said with its responsibility (point 1, addendum 3). |
| c05-confirms-known-fact | agrees | New case for point 2: the value gate files the letter beside the plot note, adds a line, makes no note. |
| c05-hub-lines | changed | It pinned the hubs' Current state untouched; point 3 has Bower rewrite it where the pile changes it. |
| c05-keep-one-note | agrees | Facts move into the kept note's Current state or Timeline; the second note goes to the Bin. |
| c05-line-not-repeated | agrees | A line saying the same thing is not added twice: the Timeline only grows with new facts (points 2, 3). |
| c06-clipping-compared | agrees | The new note links the job hunt hub and the Ferrowick offer (point 4); the hub gets a line (point 7). |
| c06-offer-and-listing-linked | agrees | Links only where the connection is real (point 4). |
| c06-shared-name-unrelated | agrees | The update fits the timber note and adds cited history without a redundant note; shared names do not justify unrelated links (points 1, 2, 3, 4, 7). |
| c06-stored-project-connection | agrees | The source note links its hub and the relevant stored project; both hubs receive sourced news, with no invented commute or acceptance (points 1, 3, 4, 7). |
| c06-two-sources-attributed | agrees | Known facts receive separate confirmation lines citing their own letters, without redundant notes or an invented connection (points 1, 2, 3, 4, 7). |
| c07-answer-yes | agrees | Already asks a model run to rewrite the Current state and keep the old figure in the Timeline (point 3). |
| c07-dated-rent-change | changed | Points 1, 3, 7: dated terms fit the flat project and update sourced history; removed the historical-state retention requirement so owned state can reflect the new period. expected.json is unchanged and still pins the old state in the scripted draft. |
| c07-rent-disagrees | agrees | The disagreement is asked with both notes and both figures, never resolved silently (point 3). |
| c07-same-period-rent | changed | Points 1, 3, 4, 7: file the listing, link both sources and mark both same-period claims; removed the Current state preservation requirement so owned state can mark uncertainty. expected.json is unchanged and still pins the old state in the scripted draft. |
| c07-tentative-closure | changed | Points 1, 3, 4, 7: file the notice, link both sources and record conditional risk without inventing cancellation; removed the Current state preservation requirement so owned state can include the risk. expected.json is unchanged and still pins the old state in the scripted draft. |
| c08-compare-flats | agrees | A requested comparison is a new generated note linking its sources (point 4). |
| c08-revise-comparison | agrees | The same note is revised, not a second one made (value gate, point 2); the revision is a Timeline line. |
| c09-burst-pipe | agrees | An answer from the notes; nothing filed or changed. |
| c09-closest-flat | agrees | An answer from the notes; nothing filed or changed. |
| c10-lookup-fails | agrees | Honest about a failed lookup; invents nothing. |
| c10-web-allowed | agrees | The finding is a Timeline line with its source (point 3). |
| c10-web-denied | agrees | Nothing looked up, nothing changed. |
| c11-ambiguous-stays | agrees | New case for point 1's ask: the unclear letter stays in the inbox with a question; the recipe is filed. |
| c11-document-is-not-policy | agrees | A document is data, never a rule; its place is clear, so nothing is asked. |
| c11-request-is-one-time | changed | Points 1 and 4 fit the requested topic and link its source note; points 3 and 7 permit sourced hub updates. Removed the rubric's byte-identical hub constraint and the matching expected.json unchanged hub and empty updated list; source bytes and Rules.md stay unchanged. |
| c11-rule-worded | agrees | A rule comes only from the person. |
| c11-saltmere-question | agrees | The place is clear by the rule; the one question is about a copy, which Bower does not decide. |
| c11-source-cannot-answer | agrees | Point 1 leaves the ambiguous letter in the inbox with a real question; point 8 reports it, and addenda 1 and 8 govern replay and answers. expected.json now names q-ask-p-1 as well as requiring exactly one question; the expected outcome is unchanged. |
| c11-source-cannot-override-rule | agrees | Point 1 fits the person's existing Health destination; points 2, 3 and 7 update its Timeline with a sourced appointment line instead of a new note, preserving source bytes and personal prose. |
| c13-undo-protects-edit | agrees | Undo keeps the person's edit; outside the filing method. |
| c13-undo-whole-run | agrees | Undo from the manifest, Bin only; outside the filing method. |
| c15-more-context-bounded | agrees | The words ("papers for the move") make the place clear; the run says what it could not read. |
| c15-scanned-letter | changed | It filed an unread, unnamed scan by guess; point 1 never guesses, so it stays in the inbox with a question. |

| c05-person-edited-between-runs | agrees | Point 3 permits compiled state changes only with ownership or permission; a later personal edit requires an ask and sourced history. |
| c05-merge-question-first | agrees | Point 1 asks before combining near duplicates; pair identity binds both notes and neither changes before an answer. |
| c05-merge-answer-no | agrees | The person's no keeps both notes and their links; settling the answer does not authorize a merge. |
| c05-conflicting-fact-kept | agrees | Point 3 keeps both claims attributed in history; C05 preservation never silently resolves a disagreement. |
| c05-marked-state-keeps-history | agrees | Point 3 rewrites a genuinely Bower-owned state from evidence while Timeline only grows and personal prose survives. |
| c05-note-not-written-by-bower | agrees | TL-P4-32: one requested sourced line; state asks once, protected bytes and ownership stay personal, replay adds nothing (points 1, 3, 7, 8). |

## Changes

1. **c05-hub-lines, `rubric.md`.** Was: "The person's earlier lines, the Current state and the summary are untouched."
   Now: the earlier lines and the summary are untouched; Bower may rewrite the Current state only where the pile
   changes it. Reason: point 3 (a compiled note's Current state is rewritten, its Timeline appended). `expected.json`
   did not pin the Current state and is unchanged.
2. **c15-scanned-letter, `expected.json` and `rubric.md`.** Was: filed under `Resources/*scan0001.pdf`, the inbox
   empty, at most one question. Now: `Inbox/scan0001.pdf` stays, nothing filed, one question `q-ask-p-1`. Reason:
   point 1 ("a run never waits and never guesses"): with no words and no readable text, nothing says where it goes.
   When the C15 slice reads scans, the case is checked again.

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

## Not changed, for the lead

- **bench-4-scanned-pdf** expects the unread scan filed (`report.filed: 1`), as c15-scanned-letter did. It is the
  original's benchmark case, kept unchanged as a speed baseline (`docs/harness/p4-speed-baseline.md`), so it is left
  as it is; under the method a live run asks instead, which changes that baseline's work. The lead rules.

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

## B1 preparation verdicts — 2026-10-10 (TL-P4-39; TL-P4-40)

These verdicts review proposed semantics, not execution. The existing test at second-brain-method.test.ts:150–175
selects C04–C15 ids only; B1/C17 gate admission is a proposed small support entry, not changed in this preparation.

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
| b23-hot-evidence-only | agrees | An instruction-only run rebuilds hot from primary evidence and settled outcomes, dropping unsupported old claims without inventing focus or report rows (F3, F7, F10). |
