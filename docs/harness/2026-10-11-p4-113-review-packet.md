# Packet: P4-113 review (b6a-templates, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b6a-templates`.

## What to review

- **Diff:** `git diff claude/p3...b6a-templates -- src runner harness`. It holds the reds and their repairs, the implementation f9545693, fix 1 59598d32 and fix 3 aaecdea3. Notes: `docs/harness/2026-10-10-b6a-templates-notes.md`.
- **Contract:**
  - the packet `docs/harness/2026-10-10-b6a-packet.md`;
  - TL-P4-47 Q5 with Q1 and Q7, and addenda 1 and 3;
  - TL-P4-42 (B2a summary), TL-P4-49 (≤3 tags), TL-P4-50 B9 markers;
  - the b6a compatibility rows.
- **Prior passes:** Codex adversarial 1 (BLOCK 3), 2 (BLOCK 2) and 3 (PASS). The lead ended the loop at addendum 3. How Next steps display is its own UI entry.
- **Gates (coordinator):** pnpm check green (519/529); e2e app/capabilities demo 35 / fake 59.

## Look hardest at

- One declaration home (note-templates.ts) and one serializer: five shapes with their sections; front matter only through note-format.
- The Source body is immutable, and an absent url is omitted. Goal and Next steps are Bower regions.
- No new Timeline on a new Source/MOC; legacy Timelines are kept unrewritten. Person notes never gain metadata or sections.
- One grounding function covers every authored field. A new note links a grounded hub plus 1–5 relevant notes, never padded.
- Every template section reaches the display model, and quoted metadata round-trips.
- Task identity is per region: a Bower-region toggle is refused with no change and a logged BowerError.
- The validSummary baseline removal is correct.
- You may run `pnpm exec vitest run src/data/contracts src/data/vault/note-format.test.ts src/data/vault/ownership-format.test.ts src/data/spine/scripted.test.ts src/features/note --maxWorkers=2`, with output to the OS temp folder.

## Reply

Reply with the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every line under 120 characters. Write the full review to the path the coordinator names.
