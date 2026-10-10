# Packet: P4-77 review (c5-empty-note-help, written by Codex; TL-P4-33 addenda 1-2)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c5-empty-note-help`. You may run `pnpm exec vitest run src/features/note --maxWorkers=2` there.

## What to review

- **Diff:** `git diff claude/p3...c5-empty-note-help`: `src/features/note/NoteScreen.tsx`, `note.module.css`, `empty-note-help.test.tsx`, `e2e/empty-note-help.spec.ts`, the notes and compatibility rows.
- **Packet:** `docs/harness/2026-10-10-c5-empty-note-help-packet.md` (the designer's copy and layout are contract).

## Look hardest at

- The exact copy, word for word; shown under exactly today's condition (no body, summary, Current state or Timeline).
- One home: the existing Open in Drive action and `openDrive` reused (NoteScreen.tsx:324), no second way; demo keeps its toast.
- Layout: one row, 12 px gap, wraps on a phone, button left-aligned, ≥ 44 px target; axe with WCAG 2.2 and target-size in the e2e.
- Note: the e2e reaches an empty note through New note, which c5-remove-new-note (next) removes; that entry switches it. Not a finding here.

Already run by the coordinator: the e2e red (4 failed without the fix), green 4/4 demo and 4/4 fake; pnpm check green.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
