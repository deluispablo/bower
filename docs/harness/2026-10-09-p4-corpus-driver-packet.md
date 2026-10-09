# Packet: p4-corpus-driver (TL-P4-28 addendum 1; runner test harness; Codex, non-escalated)

- **Entry:** `p4-corpus-driver`. Worktree `/private/tmp/bower-p4-c05-prep`, branch `p4-corpus-driver` (renamed from `p4-c05-prep`, holding the accepted C05 prep at 537859e7 and the hub-lines rubric fix). Merge `claude/p3` first.
- **Ruling:** TL-P4-28 addendum 1 (main 2dd78c84): C05 prep accepted; this entry; its cases become C05's verify when P4-C resumes. TL-P4-29: Codex implements; a fresh Claude review closes.
- **Prep:** `docs/harness/2026-10-09-c05-prep.md` (gap table, cases 1–6, scripted reply objects for 1–3).
- **Why the prep did not merge alone:** with the three new cases, `pnpm check` fails two runner tests: `c05-incorporation.test.ts:63` (the C05 case list must equal its SCRIPTS keys) and `second-brain-method.test.ts:157` (every C04–C15 case needs a verdict row in `docs/harness/2026-10-08-p4-method-rubric-changes.md`). This entry makes them pass honestly, not by filtering the new cases out.

## Contract

1. **Scorer** (`runner/src/corpus.ts`, the one home): `expected.report` gains an optional exact question count (`questionsExactly`) and a typed pair subject for a pair question (the two shown paths). Additive: old `expected.json` still reads and scores the same.
2. **`CorpusCase.between`** (optional, additive): edits applied to the folder between two runs (the person's edit: path plus new bytes, or a move). A case without it is one run, as today.
3. **A two-run scripted driver** through the existing planner and the scripted provider (`runner/test/corpus-run.ts` and `runner/src/provider.ts`): run 1, apply `between`, run 2, score the end state. No second planner, no write path outside the existing one; proposals come from the case's scripted reply objects (the prep doc's shapes, `runner/src/claude.ts:230`).
4. **Cases 1–3 run scripted** with their proposals: set each case's `covers: scripted`, add them to `c05-incorporation.test.ts`'s SCRIPTS, and give each a verdict row ("agrees" or "changed", with a reason of 10+ chars) in the method log, judged against the method (TL-P4-08).
5. **Then cases 4–5** (`c05-conflicting-fact-kept`, `c05-marked-state-keeps-history`) as folders in the same format, scripted through the driver, with rows in the README, SCRIPTS and the method log.
6. Made-up data only (Alex, Larkspur Lane, Saltmere, Ferrowick; 2026 dates).

## Red

- `the scorer counts questions exactly and checks a pair's subject`: a fixture report with two questions fails `questionsExactly: 1`; a pair question with the wrong paths fails the subject.
- `a case's between step runs between two runs`: a fixture case whose person edit must survive run 2.
- The existing C05 test (`the C05 corpus cases score green with scripted proposals`) now lists all seven-plus cases; it fails until the driver and proposals exist.

## Verify

- `pnpm -C runner exec vitest run` (all runner tests, goldens exactly 78 and 88 unchanged).
- `pnpm check` through `bash harness/with-lock.sh`.

## Commits

1. The red. 2. The scorer and driver. 3. Cases 1–3 scripted. 4. Cases 4–5. 5. The notes (`docs/harness/2026-10-09-p4-corpus-driver-notes.md`) with `tests changed:` lines.

TL-P4-28 addendum 2 supersedes the case-6 scope: deferred product-policy question, not a defect.
See `2026-10-09-c05-open-question-person-notes.md`; cases 1–5 and their expectations are unchanged.
