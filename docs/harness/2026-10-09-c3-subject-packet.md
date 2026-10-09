# Packet: c3-subject (stage 3)

- **Entry:** `c3-subject`.
  - Ruling: TL-P4-14 stage 3 row.
  - Carry-overs: P4-17 ("a refused Bin closes the hash-keyed question") and P4-15b ("an answer line stays pending after its thing left"), from `docs/harness/2026-10-08-safety-polish-carryover.md` and P2_POLISH.md:257.
  - Worktree `/private/tmp/bower-c3-subj`, branch `c3-subject` from `claude/p3`.
- **Starting model:** `bower-escalated`. The P4-17 fix orders the questions write behind a Bin (TL-P4-13).

## Today (coordinator mapping, claude/p3)

- **Three question shapes:**
  - `Question` (`src/data/contracts/types.ts:122`; wire validator `layout.ts:100`);
  - `ReportQuestion` (`run-manifest.ts:74`, filled at `scripted.ts:1441` with subject, hash and state stripped);
  - `CorpusQuestion` (`runner/src/corpus.ts:24`).
  - Also an inline `TakenAnswer.question` (`claude.ts:425-462`).
- **Copies of the same logic:**
  - the subject of a question (`subject ?? id after 'q-ask-'`) four times: `answer-loop.ts:37`, `scripted.ts:541`, `drive-vault.ts:1347`, `claude.ts:510`;
  - `STATE_Q` three times: `scripted.ts:177`, `answer-loop.ts:32`, `claude.ts:420`;
  - the open/closed logic in the planner (`scripted.ts:532-556`, `:1144-1168`, `:247-255`, `:635-650`, `:711-713`) and again in the reader (`drive-vault.ts:1335-1349`, which has no hash or folder check).
- **P4-17.** The questions write (`scripted.ts:1428-1432`) waits on answers, moves and disagreement notes, but not on the saved copy's `bin` operation. So when the engine refuses that Bin (`engine.ts:478-490`), the question is closed anyway. The carry-over doc's citation `:497` is out of date.
- **P4-15b.** `scripted.ts:253` settles a `q-ask-` answer only if the id taken from the question id is in `tookSubjects`. A yes whose thing has left is never taken, so its line stays pending.

## Contract

- **One type and one key.** One `Subject` (pile, thing, note state or folder; id and content hash). One key function and one open-questions function, used by the reader (`drive-vault.ts`, `answer-loop.ts`) and the planner (`scripted.ts`, `claude.ts`). One question type replaces the three shapes; the report row and the corpus use it, or a `Pick` of it.
- **Wire compatible.** `questions.json` written by the old app still reads, including the p2 fixtures with ids like `q1` and no subject (`compat-p2.test.ts`, `runner/test/compat-p2.test.ts`). The report row shape keeps its fields. A compatibility row is needed for any commit under `src/data/contracts`.
- **P4-17.** The questions write waits on the saved copy's Bin, so a refused Bin keeps its question open.
- **P4-15b.** An answer whose subject has left is settled by `q.subject`, never by the id prefix.
- **Otherwise unchanged:** behaviour and the goldens. Rebuild `runner/dist` only if the repo builds it in `pnpm check`. The card reports `removed: <lines>`.

## Red

- "a refused Bin keeps its question open"
- "an answer whose subject left is settled"
- "one key and one open-questions function serve the reader and the planner": a rule or fixture test that fails while four copies exist.

## Verify (exact, from features.json)

- App: "one key and one open-questions function serve the reader and the planner", "old questions without a subject still read".
- Runner: "a refused Bin keeps its question open", "an answer whose subject left is settled", "a binned duplicate.s open question closes", "leaving the inbox closes its question". If an existing test has a different exact name, use that name and report it on the card.
- Real entry point (TL-P4-17): the runner's run path and the app's `DriveVault.questions()`.

Then `pnpm check` must be green, plus `pnpm e2e:fake` if any fixture changes.

## Checklist

- Match by id or subject, never by name or prefix.
- Every Bin passes what it read.
- Commits: red, then fix, then notes in their own commit.
- Research first: cite the discriminated-union pattern in TypeScript.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
