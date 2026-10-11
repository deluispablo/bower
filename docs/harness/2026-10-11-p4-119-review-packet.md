# Packet: P4-119 review (b1d-selection)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b1d-selection`.

## What to review

- **Diff:** `git diff claude/p3...HEAD -- runner src harness/corpus`. Round 7 is the last stretch of it (addendum 24, then the TL-P4-51 red repair, then addendum 25's tests).
- **Contract:** the packet `docs/harness/2026-10-11-b1d-selection-packet.md`, TL-P4-41 addenda 13–25 in docs/harness/DECISIONS.md, and the notes in the worktree (`2026-10-11-b1d-selection-notes.md`, the Round 7 sections).
- **Previous passes:** `2026-10-11-b1d-adversarial-final{,-2,-3,-4,-5}.md`. Pass 5's blocking finding was ruled expected in addendum 25 (the merge stays whole; backlink rewrites are the script's consequence), and pin saturation is a v1 limit.
- **Gates (coordinator):** pnpm check and the capabilities e2e on demo and fake, green on HEAD; the full runner suite 713/713 in the repair.

## Look hardest at

- Execution writes only the ids the selection names; a request pin is only a candidate; an unselected request stays unconsumed in the inbox.
- A person's `type: moc` note without `by: bower` is never snapshotted as a Bower MOC.
- The 18 repaired tests (c05-bounded-reads, c05-person-notes, corpus-driver) keep every bound, fence, byte and id assertion; only selections changed.
- The new b1d-r8 tests (backlink rewrite of an unselected note; the model cannot add a non-backlink edit).
- No second planner, cache, ledger, writer or pending store.

## Reply

Reply with the full review (findings with file:line and severity), then the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Keep every card line under 120 characters.
