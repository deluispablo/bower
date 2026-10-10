# Packet: P4-74 review (p4-corpus-answers, written by Codex; TL-P4-32 finding 7)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-p4-corpus-answers`. You may run `pnpm -C runner exec vitest run test/corpus-driver.test.ts test/corpus.test.ts` in that worktree.

## What to review

- **Diff:** `git diff claude/p3...p4-corpus-answers`: `runner/test/corpus-run.ts`, `runner/test/corpus-driver.test.ts`, `runner/src/corpus.ts`, `harness/corpus/README.md`, the notes.
- **Packet:** `docs/harness/2026-10-10-p4-corpus-answers-packet.md`; ruling `docs/harness/2026-10-10-tl-p4-32-c05-person-notes-contract.md` finding 7.

## Look hardest at

- **The real answer path:** does the driver answer a question through the same path the app's answer loop uses (the answer record the next run reads), by question id, or does it shortcut by writing a result or editing the folder directly? The C05 reds will rest on this.
- **Per-run assertions:** can a per-run expectation pass vacuously (missing run, empty list)?
- **Protected ranges and properties:** compared byte for byte against the seeded text; a section boundary edge (the last section, a trailing newline) cannot hide a change.
- **Replay vs new tidy-up:** the replay reuses the original request's inbox line id; a new tidy-up gets a fresh one; both asserted.
- **Additive only:** existing cases and scorer tests unchanged; no product code; `corpus.ts` changes are additive fields with old cases valid.

Already run by the coordinator: pnpm check (the only failure was the missing `tests changed:` lines, since added).

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
