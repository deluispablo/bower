# Packet: P4-112 review (b5a-contracts, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b5a-contracts`.

## What to review

- **Diff:** `git diff claude/p3...b5a-contracts -- src runner harness`. Red: 2af99057. Q1 sweep: 7e13868e. Implementation: 9beeead0. Unused baseline handoff: the last harness commit. Notes: `docs/harness/2026-10-10-b5a-contracts-notes.md`.
- **Contract:**
  - the packet `docs/harness/2026-10-10-b5a-packet.md`;
  - TL-P4-47 Q1, Q3, Q4, Q7 and addendum 1, and the ledger amendment (answer-loop.ts: a proposal yes starts an instructions run, a no starts none; yes/no only);
  - `docs/harness/2026-10-10-tl-p4-47-b56-contract.md`;
  - the b5a compatibility row.
- **Prior pass:** Codex adversarial 1, PASS (`docs/harness/2026-10-11-codex-b5a-contracts-adversarial.md`).
- **Gates (coordinator):** e2e app/capabilities demo 35 / fake 59; pnpm check re-running after the notes fix.

## Look hardest at

- The type table:
  - versioned and hidden, written only via write-runner-json and RUNNER_WRITES;
  - stable slugs, first match wins, 8 seeds;
  - strict write and lenient read; an unreadable file means the seeds are used and nothing is written.
- Property bounds and the ≤4-column table subset; never the technical keys; group_by.
- Proposals:
  - exact immutable payload, at most 2 new per run and 5 open;
  - a declined payload never returns;
  - Q1a's homes only.
  The Codex minors on the cross-check and lifecycle are deferred to B5b; judge whether that deferral is safe.
- The profile region: at most 400 grounded words, its own mark, one parser, never adopting a person's note.
- Old notes, questions, manifests and checkpoints keep their meaning. The baselined unused exports name B5b as their remover.
- You may run `pnpm exec vitest run src/data/contracts src/data/vault/note-format.test.ts src/data/vault/ownership-format.test.ts src/data/answer-loop.test.ts --maxWorkers=2` and `pnpm -C runner exec vitest run test/type-table.test.ts`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to the path the coordinator names.
