# Packet: P4-108 review (q1c-live-questions, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-q1c-live-questions`.

## What to review

- **Diff:** `git diff claude/p3...q1c-live-questions -- src runner api`. It holds the reds (4dc7f762, moved to runner/test/q1c-live.test.ts at the Q1a merge), red repairs 2–4, the v15 red repair, the implementation c3f2d663 and fix round 1 a8cbc49e. Notes: `docs/harness/2026-10-10-q1c-live-questions-notes.md`.
- **Contract:** the packet `docs/harness/2026-10-10-q1c-live-questions-packet.md`; TL-P4-44 Q2 and addenda 1, 2, 6 and 7 (DECISIONS); `docs/harness/2026-10-10-tl-p4-44-q1-contract.md`; the q1c compatibility row.
- **Prior passes:** Codex adversarial 1 (BLOCK) and 2 (PASS).
- **Gates (coordinator):** pnpm check green; api 280/280; e2e app/capabilities demo 35 / fake 59.

## Look hardest at

- Publication happens at the first durable point (plan persisted, before effects). A crash cannot lose a question's action.
- The snapshot replaces the previous one. It holds the first 10 by askedAt, all askings are stored, and a count never fails a run.
- The revision rises on a change and phaseAt does not. The attempt, seq and ticket fences hold; malformed or over-bound payloads are refused.
- `vault.questions()` merges by id and askedAt, with the Drive copy winning. Journal suppression applies, and a wrong run/folder/session/revision is discarded.
- v15 is one appended nullable column on runs; shipped steps are byte-identical.
- No second channel, store or polling loop. No stored action in public shapes.
- Every `tests changed` line keeps its test's point.
- You may run `pnpm -C runner exec vitest run test/q1c-live.test.ts --maxWorkers=2` and `pnpm exec vitest run src/data/live/live.test.ts --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to the path the coordinator names.
