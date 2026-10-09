# Packet: c3-pair-ask fix round 2 (answered row)

- **Entry:** `c3-pair-ask` (`ui: true`), second fix round after the designer's check at bdc08775 was not verified. Worktree `/private/tmp/bower-c3-pair2`, branch `c3-pair-ask` from `claude/p3` b9fa99a1.
- **Ruling sweep (TL-P4-19 addendum 7):**
  - TL-P4-19 addendum 10 (DECISIONS:188): this round.
  - Addendum 8: one "subject gone" path for every question kind, in the subject home.
  - Addendum 9: the copy.
  - TL-P4-18 addenda 2-3: the designer checks it before close.
  - DEFECT_LOG `not-merged-never-shown`.
- **Starting model:** `bower-escalated` (wire change and the report).
- **Designer finding (bdc08775):**
  - A refused merge goes into `report.setAside` (`scripted.ts:~450`), so `runDetail` counts it as "1 thing set aside" (`run-words.ts:~114`).
  - No screen renders `setAside[].why`. Home only counts, and `NoteScreen` (`src/features/note/NoteScreen.tsx:~221`) shows `report.updated` rows only.
  - So "Not merged: X was already in the Bin." is tested but never shown.
  - Also: the app reader (`drive-vault.ts:~1353`, `openQuestions(all, answered, {ids: here})`) passes no `NotesSeen`, so a pair whose other note is in the Bin stays listed.

## Contract (addendum 10)

1. **One optional report field.** The subject home (`src/data/contracts/questions.ts`) gains `answered: [{questionId, kind, outcome, why, note?}]`.
   - The single "subject gone" path (`subjectLeft` / `notesGone`, scripted.ts) writes it for all three kinds: q-pair, q-ask and q-state.
   - It is not `setAside` and is not counted as set aside. The refused merge leaves `setAside`.
   - No second report shape, and no second "gone" path.
2. **Additive wire.** The field is optional. Old reports with no `answered` field still read, proved by a fixture test (`src/data/contracts/fixtures/p2/run-report.json`, or a new fixture next to it). Follow every reader of the report kinds: run-manifest, run-checkpoint, layout.ts `RUNNER_WRITES`, and the runner corpus if it validates reports.
3. **Shown.**
   - A row under the Home result.
   - A row on the note that stays (NoteScreen rows, the same row style as `updated`).
   - `runDetail` does not count it as set aside.
4. **Hidden.** A question whose subject is gone is not listed at all. The app reader passes what it knows of the notes (`NotesSeen`) to `openQuestions`, so a pair whose other note is in the Bin no longer shows.
5. **Copy.**
   - Pair: "Not merged: <other note display name> was already in the Bin.", with the fallback "Not merged: the other note was already in the Bin." (addendum 9; `keepAlreadyBinned` in note-edit.ts).
   - q-ask and q-state: the designer is giving their sentences now, and the coordinator relays them. Until then, use a named seam (a constant per kind) and say so on your card. Never invent copy.

## Red

- `a refused merge shows as an answered row on the note that stays and under the Home result, and is not counted as set aside`: it fails today because the merge lands in setAside and no screen shows it.
- `a pair question whose other note is in the Bin is not listed`: app reader.

## Verify (exact names)

- New: the two reds above.
- New: `an old run report with no answered field still reads`.
- New: `a gone subject writes one answered row for each question kind`.
- Kept: every c3-pair-ask verify in features.json, plus the liveness class test.
- Real entry point (TL-P4-17): the e2e:fake path that shows a run result on Home (`--project phone`). If no fake scenario reaches a refused merge, add one to the fake world, so the designer can see the row at `?source=fake`. Name the scenario on your card.
- Goldens: C04 78 and 25-runs 88 never rise. `pnpm check` must be green.

## Commits

The red (tests only), then the fix, then the notes file in its own commit, so `done.sh` can revert the fix alone. Every non-merge commit under src/features or src/data/contracts needs its row in `docs/harness/2026-10-07-p3-compatibility.md`.

## Checklist

TL-P4-13 applies: match by id, never by name. The red reproduces the finding, every sentence is backed by a test, and the card names the exact tests.

Reviewers are read-only. They never move the main checkout in any form: no `git checkout`, `switch`, subshell, `pushd` or `GIT_DIR`.
