# Defect 2026-10-09 report-misses-hub-line (diagnosis)

Read-only diagnosis at claude/p3 c1bbe55b. Severity in the log: Minor. Live evidence: staging c9d20a67, run CbTN5Md_.

## What failed

The pile "Job offer and a flat near it. Compare the commute." held an offer PDF and a link to listing-88213. After the run,
`Projects/Flat hunt/Flat hunt.md` had two new Timeline lines: "The Ferrowick offer is fully remote…" and
"New flat listing saved from a link (listing-88213)." `report.updated` in last-run.json held one Flat hunt row, for the
first line. The second line is a hub write that the person's report never mentions.

Correction to the log: Home's "Flat hunt got 1 and Job hunt got 1" is `landedSummary` (src/features/tidy/run-words.ts:154-170).
It counts `report.filed` per destination folder, not Timeline lines, so it is consistent with one thing filed into each
project (assumed: the listing note went to Flat hunt and the offer to Job hunt; `report.filed` itself is unverified).
What the person actually misses is this: the note screen marks a line "New" only when its text equals a `report.updated`
`what` for that path (src/features/note/NoteScreen.tsx:219, :180), so the second line shows without its "New" mark.
That NoteScreen behaviour was read in the code; I did not see it live.

## Where the second line is written

- The runner calls `planScripted` with `filing` and `updates: []` (runner/src/claude.ts:1096). So `demo` is false
  (src/data/spine/scripted.ts:238) and the demo's HUB_UPDATES are skipped.
- Each model `lines[]` entry is pushed into one `Wanted` per note file (`want(f, l.path)`, scripted.ts:620-628). Two
  entries naming Flat hunt.md therefore become two `WantedLine`s on one `Wanted`.
- The second line does not come from the state-news path. A `stateNewsLine` always starts "New: " (src/data/contracts/note-edit.ts:406-428),
  and the observed line starts "New flat listing". So both lines are model lines. The model reply itself was inferred, not read.
- One candidate per note gives one `edit-text` whose single `timeline-append` carries every line (scripted.ts:883-897, 904-906).

## Why no report row comes from it (5 whys)

1. Why is there only one row? The edits loop pushes one `updated` row per `edit-text` (scripted.ts:1342).
2. Why does that row name only the first line? `what = c.lines.find((l) => l.what !== null)?.what` (scripted.ts:929)
   collapses N lines to the first line's wording. The other lines' `what` values are dropped.
3. Why is this not caught? Grounding (TL-P2-20 I10, the "Report grounding added" section) asks for exactly this. An
   `updated` row must require exactly one `edit-text`, each edit may be claimed only once (`updated.has(id)`), and the row must
   "say one of its lines" (src/data/spine/grounded.ts:162-182; doc comment :43-46). One row per edit is
   the checked contract, and a second row for the same edit would be refused.
4. Why was it designed that way? `RunReport.updated: {path, what}[]` (src/data/contracts/types.ts:208,
   run-manifest.ts:77) carries two meanings at once. Home, Replay and run-words count its length as "notes brought up
   to date" (Home.tsx:98, Replay.tsx:40, run-words.ts:105), while NoteScreen reads its `what` as the set of new lines on
   a note (NoteScreen.tsx:219). One sentence per note serves the count and silently starves the line reader.
5. Why do string matches hold this together? Report rows are written by hand next to each operation in the 1,100-line
   planner (`reportPlan.push`). Their tie to what was written is then rebuilt from strings: the row's `what` against an
   entry's text (grounded.ts:179), the UI marker against the line text (NoteScreen.tsx:180), and a set-aside row against a
   move's name (report.ts:58-61). **Design cause: report rows are not derived from the operations' own content and ids,
   so a contribution can under-report an effect (as here) or misattribute one (the carry-over), and nothing structural notices.**

The demo pins the same behaviour today, so this is not runner-only. HUB_UPDATES writes two lines to Job hunt.md
(src/data/demo/fixture.ts:168-170; both written, fake-runner.test.ts:221-223). Yet `world.test.ts:412-416` expects a single
Job hunt row. I read these tests but did not run them.

## Owner mechanism

"Planning: capture, decide, build operations", `src/data/spine/` (Target, `c3-planner-split`). Its row in TL-P4-14
(2026-10-08-tl-p4-14-consolidation.md:69) already says "Report rows are generated from operation metadata, so
`grounded()` keeps only a structural check". The report read side (`report.ts` `materialize`) and `grounded.ts`
belong to the same mechanism. The mechanism map has no separate "report" row; the lead may want to name it.

## Same class elsewhere (a report row tied to its effect by string or by one-per-contribution, not by op id)

1. src/data/spine/scripted.ts:929 and :1342: one row per edit, first line only (this defect).
2. src/data/spine/grounded.ts:165-181: one row per edit enforced; row and line matched by text.
3. src/data/spine/report.ts:58-61: set-aside row and move matched by `before.name` (the stage 3 carry-over item).
4. src/data/spine/report.ts:231, :235, :244: `reportContradictions` traces filed, already-saved and set-aside rows back to
   their contributions by name and field equality.
5. src/features/note/NoteScreen.tsx:180, :219: the "New" mark matches the report's `what` against the line text.
6. Readers that treat `updated.length` as a count of notes: Home.tsx:98, Replay.tsx:40, run-words.ts:105. These are a
   constraint on any fix, not defects today. `runLinkRows` already dedupes by path (run-words.ts:181-191).

Count: 5 sites of the class besides the reported one (items 2-5 above, where item 4 has 3 lines), plus 3 count readers to keep correct.

**Is it the carry-over's class?** Yes, the same design class with a different symptom. The carry-over misattributes (a
same-name move's row falls to set aside); this defect under-reports (an applied line has no row). Both come from rows
authored beside operations and re-tied by strings, and both are cured by the same c3-planner-split clause.

## Options

- **(a) Fix inside the owner, now.** One `updated` row per planned Timeline line of the edit, each requiring that edit
  (scripted.ts:929/1342). `grounded.updatedRow` accepts several rows per edit, each saying a distinct entry of it.
  The three count readers count distinct paths. world.test.ts:412 and the fake-worker `updated` expectations
  change. Size S-M: about 4 production files and 20 lines, and it touches grounding, a data-safety check. Risk medium. It
  keeps the text match (NoteScreen, grounded :179), and c3-planner-split rewrites it within weeks: throwaway work.
- **(b) Refactor first, then fix, inside `c3-planner-split` (recommended fit).** Derive `updated` rows from each
  applied `edit-text`'s `timeline-append` entries: one row per entry, identified by op id and entry index. Shrink
  `grounded()` to the structural check the entry already plans. Have the NoteScreen marker and the counts read the same derived rows
  (count by distinct path). This closes this defect and the carry-over item with one class test. Size: inside an
  escalated L entry, about +1 acceptance test. Risk: low once the split exists. Cost: the Minor stays live until stage 3.
- **(c) New mechanism:** not applicable. The home exists (planner and report), and a parallel "line reporter" would be a
  second way to do it.

## Regression test (class)

Red, reproducing the live shape: `every Timeline line a run writes has its own report row` (src/data/spine/report.test.ts,
or the planner test c3-planner-split names). A `filing` with two `lines` on Flat hunt.md, one citing the offer and one the
listing, must give `report.updated` two Flat hunt rows. Today it gives one.
Class property, to sit beside the carry-over test ("two moves with the same name get their own rows by op id"): for every
applied operation the person can see (each `timeline-append` entry, each move, each create), there is exactly one
report row tied to it by operation id (and entry index), and no row ties to anything by name or text.
