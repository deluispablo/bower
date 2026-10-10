# Packet: P4-95 review (c05-timeline-list, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c05-timeline-list`.

## What to review

- **Diff:** `git diff claude/p3...c05-timeline-list -- src runner` (reds 947d2907; red repair cc7a8c69; fix 34cb7238) with the notes `docs/harness/2026-10-10-c05-timeline-list-notes.md`.
- **Contract:** the packet `docs/harness/2026-10-10-c05-timeline-list-packet.md`; the lead's c05-timeline-list ruling (DECISIONS after 5019e2f4); TL-P4-32 and its addenda for C05 appends.
- **Gates (coordinator):** pnpm check green; e2e c05-person-notes, capabilities, capabilities-b and app pass on demo (51) and fake (75).

## Look hardest at

- One appendability test in note-edit, used by every caller; "can't read" only for non-list sections; no second Timeline format (timeline-line.ts stays the one line format).
- The added line goes after the last bullet, keeps the file's line endings and the person's bullet marker; nested items, blank lines between items and a trailing non-list paragraph per CommonMark list items.
- Person text outside the appended line is byte-identical; old Bower-written Timelines and old notes keep their meaning.
- The red repair changed only the round 3 fixture to prose and kept that test's point (an unreadable Timeline settles and reports without a model line).
- You may run `pnpm exec vitest run src/data/contracts --maxWorkers=2` and `pnpm -C runner exec vitest run test/c05-person-notes.test.ts --maxWorkers=2` with output to /tmp/p4-95-*.log.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
