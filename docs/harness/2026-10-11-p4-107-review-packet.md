# Packet: P4-107 review (b1c-index, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b1c-index`.

## What to review

- **Diff:** `git diff claude/p3...b1c-index -- src runner`. It holds the first delivery, addenda 7–12, fix rounds 1–2 and their red repairs. Notes: `docs/harness/2026-10-10-b1c-index-notes.md`.
- **Contract:**
  - the packet `docs/harness/2026-10-10-b1c-packet.md`;
  - TL-P4-41, its Q-rows and addenda 1–12, and TL-P4-45 (DECISIONS);
  - the compatibility rows for b1c-index in `docs/harness/2026-10-07-p3-compatibility.md`.
- **Prior passes:** Codex adversarial 1–4; pass 4 is PASS (`docs/harness/2026-10-11-codex-b1c-index-adversarial*.md`). The lead ended the loop.
- **Gates (coordinator, after merging claude/p3):** pnpm check green (515/528); e2e app and capabilities pass on demo (35) and fake (59).

## Look hardest at

- The derived index at `.bower/index.md`:
  - exact PARA order;
  - a folder folds into `→ [[MOC]] (N)`, with direct counts only;
  - the honest cut stays within 32,000 characters;
  - no write when the projection is unchanged;
  - the app never writes it.
- MOC maintenance:
  - only owned MOCs, chosen by owner and type from the index's 4,096-byte prefix;
  - a person's MOC is never touched;
  - legacy by:bower migration is idempotent and keeps every other byte;
  - a same-run edit uses the settled text and version;
  - a lost reply never sends a landed MOC again.
- One ownership parser: outside-frame bytes are untouchable spans; damaged frames and indented controls refuse.
- Reports come only from settled outcomes; there is no runner-side builder and no new row kind.
- Counts:
  - cold runs plan with the in-memory index, and nothing is written before the manifest;
  - cold pins are C04 92, C05 24, reads-report 2730/3180 ms;
  - warm runs keep the pre-addendum-9 count (warm prefix = one Range);
  - a migrated MOC takes ≤2 requests.
- Every `tests changed` line holds to its addendum. No second cache, parser, writer or lifecycle.
- You may run `pnpm -C runner exec vitest run test/b1-index.test.ts --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to the path the coordinator names.
