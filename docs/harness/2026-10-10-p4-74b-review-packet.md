# Packet: P4-74b delta review (p4-corpus-answers fix round 1, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-p4-corpus-answers`. You may run `pnpm -C runner exec vitest run test/corpus-driver.test.ts test/corpus.test.ts` there.

## What to review

- **Delta:** `git diff e7f84724..HEAD` (reds 01512fb6, fix 1d1dcb79, notes). The first review: `docs/harness/2026-10-10-p4-74-review-packet.md`; its BLOCK: the scripted corpus loop (runner/test/corpus.test.ts:35) scored with the pure `score()`, which ignores the driver-only fields, so a case using them passed vacuously. Minors: empty `questionSubjects`/`absent`/`equals` lists passed vacuously; a replay of a still-active request was indistinguishable from a real replay.
- **Packet:** `docs/harness/2026-10-10-p4-corpus-answers-packet.md`.

## Look hardest at

- **One scorer:** the loop now asserts the driver's full score; is there still any path where a driver-only field is ignored? Is the pure `score()` still a second scorer for the same cases?
- **Empty lists** are refused, not skipped; **the replay outcome** is reported and asserted.
- **No loosening:** compare each changed assertion in corpus.test.ts with the base; the `tests changed:` lines (notes lines 136-138) match the diff.

Already run by the coordinator: pnpm check green.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
