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
