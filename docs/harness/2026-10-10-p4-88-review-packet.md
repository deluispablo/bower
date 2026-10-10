# Packet: P4-88 review (b3a-hot-reduce, written by Codex; TL-P4-42 Q3, Q4, Q6)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b3a-hot-reduce`.

## What to review

- **Diff:** `git diff claude/p3...b3a-hot-reduce`: new `runner/src/hot.ts`, new `runner/test/b23-hot.test.ts`, notes, two Codex passes.
- **Contract:** the packet `docs/harness/2026-10-10-b3a-hot-reduce-packet.md`; TL-P4-42 (`docs/harness/2026-10-10-tl-p4-42-b23-contract.md`) Q3, Q4, Q6.
- **Prior passes:** `docs/harness/2026-10-10-codex-b3a-hot-reduce-adversarial.md` (BLOCK: markdown in rows, cap marks) and `-2.md` (BLOCK: HTML blocks); both fixed with red repairs. This is round 2's end; a third round is a re-plan by the lead.

## Look hardest at

- Every packet point has a red that would fail without its code, and no red is weaker than its point (the two red repairs included).
- Row escaping: no input can start any CommonMark block in a row; escaping does not corrupt ordinary text mid-line.
- The 300-word cut: order, marks, at most 300 words, with marks and escapes counted; caps add no mark except threads.
- Purity: no I/O, clock, model, parser of note bytes, tree or store; no second mechanism for anything the runner already does.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
