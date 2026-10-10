# Packet: P4-67 review (c4-undo-compensate, escalated data safety; Opus, then Codex; TL-P4-27 addenda 2 to 11)

This review is read-only and fresh. Run unit tests only (the runner included); never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-compensate`.

## What to review

- **Diff:** `git diff claude/p3...c4-undo-compensate`. It is a long branch:
  - the Opus implementation (addenda 2 to 5);
  - the Codex property red and its amendments (addenda 6 and 7);
  - Codex rounds 2, re-plan and last (addenda 8 to 11);
  - merges with c4-create-landed (resolved by Codex) and c4-parse-once.
- **Packet:** `docs/harness/2026-10-09-c4-undo-compensate-packet.md` (the last section) and DECISIONS.md TL-P4-27 addenda 2 to 11. **Notes:** `docs/harness/2026-10-09-c4-undo-compensate-notes.md`.
- **Codex passes:** `docs/harness/2026-10-09-codex-c4-undo-compensate-adversarial.md`. The last pass's 3 storage-failure findings are recorded as known limits (DEFECT_LOG `compensate-storage-failure-limits`), per addendum 11. Do not re-raise them unless one is not a storage-failure edge case.

## Look hardest at

- **One send path.** record() appends under the lock and awaits the one drain. No unlocked fast path, `flying` or `behind` is left.
- **Undo.** retract() is decided under the lock. A dropped line is never sent, and an inverse is never sent for a failed or refused original.
- **Rules.** wordRules and rules() follow one sequence by since. Ties go by at, then id. Old manifests (no removals, or removals without since) behave byte for byte as before.
- **pairsOf, the later-inverse rows for every kind, and the volatile outbox** (addendum 10).
- **Reds.** Every red was changed only by red-owning sessions under a ruling. Every test deletion or rename has its `tests changed:` line and the ruling behind it (addendum 6: the reviewer checks these).
- **The kept files** from the parked branch, and the one change at `grounded.ts:90`, which must ground only a single archive row (addendum 10).
- **Copy.** The offline Bin Undo reads "Not undone yet: Bower could not reach Drive. Try again when you are back online." with "Try again". removePile's copy is unchanged.
- **Compatibility rows** for every commit under src/data/contracts or src/features. Also: no `.only`, `.skip` or real timer.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
