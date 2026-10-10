# Packet: P4-70 review (c4-create-newer-words, escalated data safety; Codex; TL-P4-24 addendum 19)

This review is read-only and fresh. Run unit tests only (the runner tests included); never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-newer-words`.

## What to review

- **Diff:** `git diff claude/p3...c4-create-newer-words`: the reds (red-owning session), fix ec30299d, notes.
- **Packet:** `docs/harness/2026-10-10-c4-create-newer-words-packet.md`. **Ruling:** DECISIONS.md TL-P4-24 addendum 19.
- **Codex adversarial pass:** `2026-10-10-codex-c4-create-newer-words-adversarial.md`, 0 findings.

## Look hardest at

- **Newer words.**
  - A pending conversion still sends its first intent.
  - The newer words are applied only after the whole conversion has landed, as an ordinary fenced update with the modifiedTime check.
  - updatePile resolves only after that update lands.
  - An outside change in between is refused, never written over.
- **One home.** The update goes through the existing fenced note update, with no second write path. The held intent in write-once.ts is unchanged in meaning.
- **The reds** were changed only by the red-owning session. `tests changed:` lines are present, and there is no `.only`, `.skip` or real timer.

Already run by the coordinator: pnpm check green. e2e qa9, qa10 and capabilities are green, except one known flake that is already on claude/p3 (DEFECT_LOG `capabilities-210-flaky`).

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
