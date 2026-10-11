# Packet: P4-123 review (b5b-tables)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b5b-tables`.

## What to review

- **Diff:** `git diff claude/p3...HEAD -- src runner harness e2e`. The branch carries the typed facts, the Table, proposals, the create-when-absent table file, the live proposal path (claude.ts reply schema and askAfter), the adversarial fix round and four red repairs.
- **Contract:** the packet `docs/harness/2026-10-11-b5b-tables-packet.md` (Contract, Reds, "Ruled"), TL-P4-47 addenda 1–10 in docs/harness/DECISIONS.md, and the notes (`2026-10-11-b5b-tables-notes.md`, all implementation, ruling, repair and step 2 sections).
- **Adversarial pass 1:** `2026-10-11-b5b-adversarial-1.md` (BLOCK: Source immutability by role, more than four columns, row-level splice, unwired live proposals); the fix round and step 2 answer all four.
- **Gates (coordinator):** pnpm check, and e2e app, capabilities and folder-table on demo and fake, green on HEAD (b5b-g3).

## Look hardest at

- Authority: only the exact frozen payload with a boolean yes installs; text answers close the question and install nothing, the text reaching the continuation as the person's words (at most 2 rounds); option answers to a proposal are refused; declined proposals never return; at most 2 new proposals per run and 5 open; a document can never teach schema.
- The type table file: first creation of the eight seeds, strict new versus lenient rewrite, row-level splice that keeps unknown keys and bytes, the first four columns, bounds, unreadable means no writes.
- One source-role helper used by every immutability check.
- The Table screen (FolderScreen): declared order, at most four columns, Name/Status/Changed controls, nothing projected that is excluded.
- Drive-call pins: creating run 99, existing-table run 97, nothing else loosened; the 110-call control kept.
- The repaired older tests (b5-incorporation, drive-calls-golden, timing-counts, model-input-fingerprint) keep every bound, byte and id assertion.
- No second parser, writer, loader or pending store; B4a's validator and maintenance helper untouched.

## Reply

Reply with the full review (findings with file:line and severity), then the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every card line under 120 characters.
