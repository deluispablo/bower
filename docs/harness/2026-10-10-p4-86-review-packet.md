# Packet: P4-86 review (q-ui-3, written by Codex; questions UI spec Q-UI-3)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-q-ui-3`.

## What to review

- **Diff:** `git diff claude/p3...q-ui-3`: one line in `src/ui/ui.module.css` (the desktop `.sheet` max-height), `e2e/q-ui-3.spec.ts`, notes.
- **Contract:** `docs/harness/2026-10-10-q-ui-3-packet.md`; spec `docs/design/specs/2026-10-10-questions-ui.md` § Q-UI-3 (owner-approved).

## Look hardest at

- Exactly the spec's line in the `@media (min-width: 900px)` `.sheet` rule; nothing else changed; phone sheets untouched; `overflow: auto` already present so the body scrolls.
- The e2e uses an existing screen with no test-only hook; its positive control proves the content is taller than the window; it asserts the sheet ends inside 720 px and scrolls; axe WCAG 2.2 with target-size runs on the open sheet. The coordinator proved it red without the CSS line ("the sheet ends inside the viewport") and green with it, on demo and fake.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
