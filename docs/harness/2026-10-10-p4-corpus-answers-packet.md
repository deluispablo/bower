# Packet: p4-corpus-answers (TL-P4-32 finding 7; Codex, harness, non-escalated)

- **Entry:** `p4-corpus-answers`. Worktree `/private/tmp/bower-p4-corpus-answers`, branch `p4-corpus-answers` from `claude/p3`.
- **Ruling:** [TL-P4-32](2026-10-10-tl-p4-32-c05-person-notes-contract.md) finding 7: the corpus driver gains what C05 needs, as its own preparatory entry before the C05 reds.
- **Starting model:** Codex. Then a fresh Claude review.
- **Owned files:** `runner/test/corpus-run.ts`, `runner/test/corpus-driver.test.ts` (and a new runner test file if cleaner), `runner/src/corpus.ts` only for additive case/expected fields, `harness/corpus/README.md`. No product code (`runner/src/*` other than corpus.ts, `src/`).

## Contract

The driver (`runner/test/corpus-run.ts`) already runs a case through runner `main` over the pretend Drive v3 and can run several presses on one Drive (`runOnDrive`, `runs`). It gains:

1. **An answer through the real answer entry point.** Between presses, a step answers a question the previous run produced, by its question id as the app would (the same path the app's answer loop writes: the answer record in the folder that the next run reads). Both answers of a pair: "Write it" / "Keep mine" (yes / no). No shortcut that writes the run's result directly.
2. **An assertion per run.** Expected outcomes can be stated for each press (first-run append, the typed state question with its kind and subject), not only the final run. Additive to `expected.json` (e.g. `runs: [...]`); single-run cases are unchanged.
3. **Protected byte ranges and Drive properties compared directly.** An expectation can name a note and a range (a section by heading, or the front matter) that must stay byte-identical to the seeded text, and appProperties that must stay absent or equal (e.g. no `by`, no `bower_state`). Substring checks stay as they are.
4. **Replay vs a new tidy-up.** A step can replay the original request (the same inbox line id, as a resume or retried press would) or add a new tidy-up (a fresh request); the driver keeps them distinct.
5. Existing cases score exactly as before (the C04/C05 cases and the scorer's tests unchanged).

## Reds (tests first)

In `runner/test/corpus-driver.test.ts` (or a new file), on a small made-up case:
- a run asks a pair question; the next step answers "Write it" through the answer path; the third run's report and note show the answer consumed once;
- the same with "Keep mine": nothing written, not re-asked;
- a per-run expectation fails when the first run lacks the expected question, and passes when present;
- a protected range check fails when one byte of the person's section changes;
- a property check fails when `by: bower` appears;
- a replay of the original request id is distinguished from a new tidy-up (two different run inputs, asserted).

## Commits

1. The reds. 2. The driver change. 3. The notes (`docs/harness/2026-10-10-p4-corpus-answers-notes.md`, `implementer: codex`, `removed:` lines, `tests changed:` in the exact form `tests changed: <path>: <why>` if any existing test changed).
