# Packet: P4-110 review (b3b-hot-maintain, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b3b-hot-maintain`.

## What to review

- **Diff:** `git diff claude/p3...b3b-hot-maintain -- src runner harness`. Notes: `docs/harness/2026-10-10-b3b-hot-maintain-notes.md`. It holds:
  - the reds and their repair (511968f2, 0b816ced) and the fixture repair (4da9f517);
  - the implementation 9e23ad6e, addendum 5 (9cad8b47) and its re-pins (89e663bb, 49ef30a6);
  - fix round 1 (b6a6adf0, fc93010d).
- **Contract:**
  - the packet `docs/harness/2026-10-10-b3b-packet.md`;
  - TL-P4-42 Q4/Q5/Q6/Q8 and addenda 1, 4 and 5, TL-P4-45, and TL-P4-41 addendum 4 (DECISIONS);
  - `docs/harness/2026-10-10-tl-p4-42-b23-contract.md`;
  - the b3b compatibility row.
- **Prior passes:** Codex adversarial 1 (BLOCK) and 2 (PASS).
- **Gates (coordinator):** e2e app/capabilities demo 35 / fake 59; pnpm check is being re-run after the notes fix.

## Look hardest at

- Hot is a generic declared target of the one maintain effect. There is no second writer. It is written only when more than its date changed, and there is no archive. Parent and renderer are chosen per kind.
- Hot is read after the done checks, bounded at 4,000 characters, at prompt position 6. A missing hot adds nothing.
- Inputs:
  - authoritative open questions;
  - hubs with a settled Timeline change in 30 days;
  - Recent changes as a rolling window (this run's settled journal changes ahead of the prior rows, ≤10, zero archive reads);
  - validated dates.
- Lifecycle: every settling run refreshes; a pre-plan failure or a done run writes nothing; Undo rebuilds from restored evidence; replay and lost replies resume once.
- Goldens: cold rises by the four named calls (C04 96, C05 25), and the time bases rise by 600 ms. A warm refresh adds the prompt read and one fenced write. The fingerprint changes by the key reorder only.
- Every `tests changed` line holds to its addendum.
- You may run `pnpm -C runner exec vitest run test/b23-hot-context.test.ts test/b23-hot-recovery.test.ts --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to the path the coordinator names.
