# Packet: P4-64 review (p4-corpus-driver, written by Codex; TL-P4-28 addenda 1 and 2)

This review is read-only and fresh. Run unit tests only (the runner tests included); never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-p4-c05-prep`.

## What to review

- **Diff:** `git diff claude/p3...p4-corpus-driver`. It carries the accepted C05 prep (537859e7), the hub-lines rubric fix (ab8d032d), the red 3cdc9eb6, the scorer and driver 0b77422f, cases 1-5 6f2fc472, and the notes c654c1d2.
- **Packet:** `docs/harness/2026-10-09-p4-corpus-driver-packet.md`. **Prep:** `docs/harness/2026-10-09-c05-prep.md`. **Rulings:** TL-P4-28 addenda 1 and 2 in DECISIONS.md.

## Look hardest at

- **Additivity.** Old `expected.json` and `case.json` files still read and score the same. The `questionsExactly` field, the pair subject and the `between` step are optional.
- **One write path.** The two-run driver goes through the existing planner and provider; `replies.json` only supplies replies at the provider boundary. Is there any second planner, test-only writer, or bypass of the fenced runner operations?
- **Cases 1-5 are honest.** Each case's expectations prove what its prep row says. None was weakened to pass (compare the prep's expected outcomes with the committed `expected.json`). The method-log verdicts have real reasons.
- **Case 6 is fully removed** and recorded as an open question (`2026-10-09-c05-open-question-person-notes.md`), with no recommendation in it.
- **The goldens** stay exactly 78 and 88. Data is made up (Alex, Larkspur Lane, Saltmere, Ferrowick, 2026).
- **Housekeeping:** `tests changed:` lines, no `.only` or `.skip`, and no real timers.

Already run by the coordinator: pnpm check green at c654c1d2. Codex ran the runner tests: 314 pass.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
