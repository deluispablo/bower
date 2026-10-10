# Packet: P4-68 review (c4-create-resume, escalated data safety; Codex; TL-P4-24 addenda 16 to 18)

This review is read-only and fresh. Run unit tests only (the runner tests included); never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-create-resume`.

## What to review

- **Diff:** `git diff claude/p3...c4-create-resume`. Red fb0120e9, round 1, round 2, then the re-plan red and fix (addendum 18), with notes.
- **Packet:** `docs/harness/2026-10-10-c4-create-resume-packet.md`. **Diagnosis:** `defects/2026-10-10-create-property-time-dependent.md`. **Rulings:** DECISIONS.md TL-P4-24 addenda 16 to 18.
- **Codex passes:** `2026-10-10-codex-c4-create-resume-adversarial.md`. The re-plan pass found 0.

## Look hardest at

- **One held intent** covers the whole pile conversion, in write-once.ts, the one home: the reserved ids, the first names, and the steps already landed.
  - It is released only when all three steps have landed.
  - A retry resumes at the first step not landed.
  - Every step is idempotent, and no name is ever recomputed during a conversion.
- **The round-1 and round-2 per-step holders are really gone.** There is no second landed question and no call site building its own expectation.
- **The fixed clocks.** Each test moved off the real `Date.now()` has its `tests changed:` line, and no assertion changed. The property is pinned to the midnight case.
- **Reds changed only by red-owning sessions.** Compatibility rows exist where needed. No `.only`, `.skip` or real timer.

Already run by the coordinator: `pnpm check` green, before the re-plan, at the round-2 tip. Codex ran the unit and runner tests at the tip: green, goldens 78 and 88.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
