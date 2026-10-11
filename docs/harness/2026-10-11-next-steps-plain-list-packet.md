# Packet: next-steps-plain-list (TL-P4-55 (1); ui: true)

- **Entry:** `next-steps-plain-list`. Worktree `/private/tmp/bower-next-steps-plain-list`, branch `next-steps-plain-list`. Not escalated: Codex red, Codex implementation, Claude review, then the designer's verified (TL-P4-18 addendum 3). It starts after B6a integrated (9f478276).
- **Spec:** `docs/design/specs/2026-10-11-next-steps-plain-list.md` (owner OK, read-only). Ruling: TL-P4-47 addendum 3, TL-P4-55 (1).
- **Owned files:** `src/features/note/markdown.tsx`, `src/features/note/markdown.test.tsx`, `src/features/note/NoteScreen.tsx` (tick wiring only, if needed), new `src/features/note/next-steps-plain-list.test.tsx`, new `e2e/next-steps-plain-list.spec.ts`. Read only: B6a's per-region task identity (`src/data/contracts/note-edit.ts`, `src/data/vault/ownership-format.ts`) and `src/features/note/b6a-task-regions.test.tsx`.

## Contract
The note view's Markdown renderer is the one home. In a Bower region (for example "Next steps"), a task line (`- [ ]` / `- [x]`) shows as a plain list item with no Checkbox. An open item has the list's normal bullet and its text. A done item is the same, in today's `md-done` look, with no box.
Outside Bower's regions, the person's own tasks keep today's working Checkbox. Their tick indexes count only the person's tasks, so a tick never lands on a Bower item. Reuse B6a's per-region task identity; add no second region parser.
No new copy, no hint text, no new component. The plain items are list items, not disabled controls.

## Tests (the spec's rows, verbatim)

| Situation | What shows |
| --- | --- |
| A Bower project note with Next steps | Bullets with no boxes; done items muted and struck. |
| The person's own task list in the same note | Working checkboxes, as today; ticking one changes only that task. |
| A note with no Bower region | As today. |

Accessibility: axe at WCAG 2.2 on a project note, on demo and fake, at 375 and 1440.

## Verify
The reds by exact name (prefix `NSPL `), `pnpm check`, the note component tests and e2e for the note screen plus the new spec, on demo and fake. Test output to the OS temp folder; read failures only. The designer verifies before closure.

## Ruled (TL-P4-55 addendum 1)

- Option 1: one entry, with the packet expanded. The owned files add `src/data/contracts/note-format.ts`, `src/data/contracts/types.ts` and `src/data/vault/drive-vault.ts`, plus the demo and fake sources where a Note is built (`src/data/demo/*`, `src/data/fake/*`). A contract compatibility row is required.
- `Note` gains an additive optional field, built from B6a's projection (note-format.ts:169-197): each body task's region, in body order. When the field is absent, every task is the person's. drive-vault.ts:315, demo and fake fill it from that same projection. The UI never parses regions.
- Toggles stay on global body indexes. Each of the person's checkboxes carries its own body index, and Bower tasks render as plain items, so no index mapping is needed.
- b6a-task-regions.test.tsx:87 and :99 stand unchanged. Any NSPL red that assumes person-only indexes is repaired to body indexes.

## Commits
Red, fix, notes (`docs/harness/2026-10-11-next-steps-plain-list-notes.md`, line 3 `implementer: codex`). The coordinator commits.
