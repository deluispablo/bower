# Packet: c5-empty-note-help (TL-P4-33 addenda 1 and 2; Codex, UI, non-escalated)

- **Entry:** `c5-empty-note-help` (ui: true). Worktree `/private/tmp/bower-c5-empty-note-help`, branch `c5-empty-note-help` from `claude/p3`.
- **Ruling:** DECISIONS TL-P4-33 addendum 1 (the in-app editor is withdrawn; the empty-note line drops the "later version" promise and says how to edit, with the existing Open in Drive action beside it) and addendum 2 (the designer's copy and layout).
- **Starting model:** Codex. Then a fresh Claude review and the designer's check.

## Contract

1. The empty-note line (`src/features/note/NoteScreen.tsx:151`) shows under exactly today's condition (no body, summary, Current state or Timeline) and reads, word for word: `This note is empty. To write in it, open your Bower folder on your computer with Google Drive for desktop, then use any notes app.`
2. Beside it, the existing Open in Drive action (the one at NoteScreen.tsx:324, through the existing `openDrive`; the demo keeps its toast): a small ghost button with the drive icon, label as today's action. One home: reuse the existing action and button parts, no second way to open Drive.
3. Layout: one row with a 12 px gap that wraps on a phone; the button left-aligned when wrapped; its target at least 44 px.
4. Nothing else changes; Drive's web page is never promised as an editor.

## What the person sees (designer's copy, TL-P4-33 addendum 2; contract)

| State | What shows |
| --- | --- |
| An empty note (no body, summary, Current state or Timeline) | The line `This note is empty. To write in it, open your Bower folder on your computer with Google Drive for desktop, then use any notes app.` and beside it a small ghost button with the drive icon, the existing Open in Drive label, opening the note in Drive (demo: the existing toast). One row, 12 px gap; on a phone it wraps, button left-aligned, 44 px target. |
| Any other note | Unchanged: no line, no extra button. |

## Reds

- A component test: the exact copy and the action under the empty condition (pressing it calls openDrive for this note); absent when any of body, summary, Current state or Timeline is present. Name it exactly `an empty note says how to write in it and offers Open in Drive`.
- An e2e (demo; a new empty note via New note, or an existing empty demo note) at 375 and 1440: the line and the button visible; at 375 they wrap with the button left-aligned; at 1440 one row; the button's box is at least 44 px tall and wide; axe with WCAG 2.2 and target-size.

## Commits

1. The reds. 2. The fix. 3. The notes (`docs/harness/2026-10-10-c5-empty-note-help-notes.md`, `compatibility: FIXSHA`, since it touches src/features).
