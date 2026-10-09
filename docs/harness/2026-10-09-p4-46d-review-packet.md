# Packet: P4-46d check (c3-pair-ask fix round 3: label and pair name)

Read-only and fresh. Unit, runner and contract tests only: never start a server, run e2e or call the claude CLI. Never check out the main repo, in any form. Run git with `-C /private/tmp/bower-c3-pair3`.

- **Diff:** `git diff c6c4f69da15f06557da9c325c0e19fdc2c05180a..504c3827` is the label part; `git diff eb9bc185..8b310e41` is the name part (after the merge of claude/p3). The whole round is the commits from aa83f697 to 8b310e41.
- **Packet:** docs/harness/2026-10-09-c3-pair-ask-round3-packet.md, including the section "Part 2 resumed". Notes are in the round 3 notes file.
- **Rulings:**
  - TL-P4-19 addendum 11 (1): the answered rows get their own label, "Answers Bower could not act on", in the same component and style as "New notes", and are never under "Brought up to date" (WCAG 1.3.1).
  - Addendum 14: one drive.get per gone pair note, only when a pair row is made, through the one transport; a 404 or any refusal falls back to "the other note"; the goldens hold.
- **Fixed questions (TL-P4-20):** contract first, then second way. Is there a second label component, a second Drive path or a second gone check? Give every finding a severity.
- **Look hardest at:**
  - The drive.get runs only when a pair row is made, never on other runs. Count the calls in the goldens, and check that runner/src/drive.ts and the app use one transport.
  - The refusal path: is the error logged (console.error), and never swallowed?
  - A display name never has a file extension.
  - The `tests changed:` lines, no `.only` or `.skip`, and the compatibility rows.
- **Reply:** the review card from `docs/harness/WORKER.md` (PASS or BLOCK), each line under 120 characters. Details go in `/private/tmp/p4-46d-review-notes.md`.
