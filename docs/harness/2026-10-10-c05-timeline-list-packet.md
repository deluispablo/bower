# Packet: c05-timeline-list, a person's bulleted Timeline is appendable (lead ruling, DECISIONS after 5019e2f4)

- **Entry:** `c05-timeline-list`. Worktree `/private/tmp/bower-c05-timeline-list`, branch `c05-timeline-list`. `ui: false`: no new strings; existing rows are reused.
  - Codex red session (may run now).
  - Codex implementation, **after B1a integrates** (both edit note-edit.ts).
  - Claude review.
- **Evidence:** staging 645710a4. A person's note with `## Timeline` / `- 1 Oct: Alex dug the first bed.` got "Bower didn't add the line: it can't read this note's Timeline." Diagnosis: `docs/harness/defects/2026-10-10-c05-person-timeline-format-diagnosis.md`. In `note-edit.ts:213`, `timelineRefusal` requires every line to parse with timeline-line.ts's Bower grammar.
- **Ruling:** any Timeline section that is a bullet list (`- ` or `* `) is appendable. Bower adds its one timeline-line.ts line after the last bullet, keeping the file's line endings and the bullet marker. "Can't read" stays only for non-list sections. There is one appendability test in note-edit's home and no second grammar.
- **Research first:** cite CommonMark list items (bullet markers, nesting, blank lines between items).

## Contract

1. **One structural appendability predicate in note-edit.** Both `personalTimelineRefusal` and `appendLines` use it. It returns either the refusal or the append position and the top-level marker. It never interprets the person's dates or prose.
2. **timeline-line.ts stays the only grammar and writer for Bower's line.** It writes with the chosen `- ` or `* ` marker. note-format's bullet extraction keeps both markers, so the re-parse invariant holds. No colon-date parser is added.
3. **Placement:**
   - Use the original byte offsets, never normalizing (CRLF is kept).
   - Append after the last top-level item's whole subtree, at top level.
   - When markers are mixed, use the last top-level marker.
   - Insert before trailing blanks, keeping the final-newline state.
   - Stop before a following heading; never append into the next section.
4. **Kept:** consent, one sourced line, modifiedTime checks, record-id completion (records.ts), and the "already has this line" check. A Bower-shaped `* ` line must parse there. Arbitrary person lines stay opaque.

## Reds (through runner `main` via the corpus driver; made-up data)

1. Dated-colon list, scripted with no line: the "nothing found" row (NOTHING_FOUND_WHY), unchanged bytes, zero completions. Today it says "can't read".
2. Plain list, plus one sourced line offered: appended exactly once, report updated, request archived, completion recorded. Repeat without front matter.
3. Prose section: "can't read" stays, with unchanged bytes and zero completions even when a line is offered.
4. Positive controls: an appendable person note, and the existing Bower-owned case.
5. Exact-byte cases: CRLF, `* `, nested children, trailing blanks, a following heading. A preseeded Bower-shaped `* ` line gives no duplicate on replay.
6. Replace the existing "unparseable Timeline" fixture `* September: planted garlic.` (c05-person-notes.test.ts:218) with real prose, per the ruling, and add a `tests changed:` line.

## Verify

The reds by exact name, the C05 runner and app tests, `pnpm check`, then e2e c05-person-notes, capabilities and app on demo and fake.

## Commits

The red (tests only), then the fix, then the notes (`docs/harness/2026-10-10-c05-timeline-list-notes.md`, line 3 `implementer: codex`, with `removed:` lines and compatibility rows).
