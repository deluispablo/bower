# c3-pair-ask round 3 notes (TL-P4-19 addendum 11)

Worktree `/private/tmp/bower-c3-pair3`, branch `c3-pair-ask`, from `claude/p3` b15bda51.

## Commits

- `aa83f697` red, tests only.
- `759f1fdd` fix: the answered label.
- `9e27f451` compatibility rows for both.

## Contract 1, the section label: done

- `src/features/tidy/RunLinks.tsx`: one `LabelledList` (the visible `<p id>` label plus `<ul aria-labelledby>`), used by both `LinkList` ("New notes", "Brought up to date") and `AnsweredRows`. The answered rows sit in their own list, "Answers Bower could not act on", never under "Brought up to date". `AnsweredRows` carries the label wherever it shows: the Home result card, the done sheet, and the note that stays. c3-state-mark reuses `AnsweredRows` for every answered row.
- Red: `the answered rows have their own label and never sit under brought up to date` (`src/features/tidy/RunLinks.test.tsx`). It failed on `Unable to find an accessible element with the role "list" and name "Answers Bower could not act on"`. The e2e red failed the same way on phone and desktop.
- Sources: WAI tutorials, content structure, lists (https://www.w3.org/WAI/tutorials/page-structure/content/#lists); ARIA APG, names and descriptions, naming with aria-labelledby (https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/); Understanding WCAG 1.3.1 (https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html).

## Contract 2, the pair name: blocked, needs a ruling

The ruling assumes that the subject-gone check already read the trashed item. It does not. The check (`subjectLeft` and `notesGone` in `src/data/contracts/questions.ts`) reads only `VaultIndex.notesSeen()`. That comes from the listing, which queries `trashed = false` (`src/data/drive/drive-http.ts:140`). Neither the planner (`src/data/spine/scripted.ts` around line 411) nor the app reads the Bin item of a gone note, so a trashed note's name is never in hand. These are the three ways out; each breaks one part of addendum 11.

- (a) One `drive.get(id, { binned: true })` for each gone pair note, only when a pair row is made. A trashed file keeps its name, and the fallback is used only on a 404. This is an extra Drive call, but only in the rare gone-pair case, so the C04 and 25-runs goldens should not rise.
- (b) Use the journal's `trash` line, which the run has already read. It carries `fileId` and `path`, so it matches by id, with no Drive call. It does not cover a note binned in Drive itself; that case gets the fallback even though the file can be read.
- (c) Keep the other note's name on the question when it is asked. That is a field on the stored `Question`, a wire change.

No pair-name code or test is in this branch. The named reds `a pair whose other note is in the Bin is named from the item already read` and `a pair whose other note cannot be read uses the fallback` are not written.

## Gates

- `pnpm check`: pass, after this notes commit (log `/tmp/c3-pair3-check.log`).
- e2e:fake `a refused merge shows as an answered row on the note that stays and under the Home result, and is not counted as set aside` (`?scenario=gone-answers`) and `C11: a kept rule and a merge answer are applied`: phone and desktop pass, 4/4 (log `/tmp/c3-pair3-e2e.log`). Axe runs with the tags wcag2a, wcag2aa, wcag21a, wcag21aa and wcag22aa, `target-size` enabled, on the done sheet and on Home's main.
- Goldens: no Drive path was touched (UI only).

tests changed: e2e/capabilities.spec.ts: the gone-answers journey also checks the answered rows' own label, that they are not under "Brought up to date", and runs axe (WCAG 2.2, target-size) on the sheet and Home; no assertion removed

## Addendum: part 2 under TL-P4-19 addendum 14 (option a)

Merged `claude/p3` (eb9bc185), which carries the ruling. The "blocked" section above is superseded by what follows.

- Commits: `1a8cc05a` red (tests only); `294c7140` fix; `4762c9fa` compatibility rows.
- The plan's read interface (`SpineRead`, `src/data/spine/plan.ts`) gains `binned(id)`, one `files.get` with the Bin included. The adapters are `driveRead`, `fakeRead`, `admissionRead` (granted as one budgeted read, `g:<id>`) and the runner's `planReads` (`runner/src/drive.ts`). It is the one transport for every read of the plan; no second path.
- The planner (`src/data/spine/scripted.ts`) asks `binned` once for each distinct gone pair note, and only for a yes whose answered row it makes (`binnedPairNote` in `src/data/contracts/questions.ts`: a pair asked by ids with exactly one note gone). The name is `displayName` of the file name, so no extension. Any error (a 404 or any refusal) is logged with `console.error` and leaves the fallback "the other note".
- Reds: `a note binned in Drive itself shows its name in the row` (it also asserts that the only get of that file is `[id, { binned: true }]`) and `a pair whose other note cannot be read uses the fallback` (it failed on its `console.error` assertion). Both are in `src/data/fake/fake-runner.test.ts`.
- Goldens: `runner/test/drive-calls-golden.test.ts` pass, C04 78 and 25 runs 88 (log `/tmp/c3-pair3-goldens.log`).
- Gates: `pnpm check` pass after this commit (log `/tmp/c3-pair3-check.log`). e2e:fake gone-answers and C11 pass on phone and desktop, 4/4, with axe (log `/tmp/c3-pair3-e2e.log`).

tests changed: src/data/fake/fake-runner.test.ts: the gone-subject row now names the other note (Bin name, addendum 14); two tests added
tests changed: runner/test/ask-answer-loop.test.ts: a note binned in Drive is now named in its row ("Flat 3 (second)"), not the fallback
tests changed: e2e/capabilities.spec.ts: the gone-answers pair row now reads "Not merged: Flat 2, 40 Tanners Walk was already in the Bin."
