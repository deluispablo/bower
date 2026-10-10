# Packet: P4-94 review (b1a-contract, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-b1a-contract`.

## What to review

- **Diff:** `git diff claude/p3...b1a-contract -- src runner` (reds f9da5278 + red repairs 1–7; fix 254e728f; fix rounds 1, 3 and 4) with the notes.
- **Contract:** the packet `docs/harness/2026-10-10-b1a-packet.md` (both addenda); TL-P4-41 Q1, Q2, Q4, Q5, Q9, Q11 and addenda 1–6; TL-P4-45 (DECISIONS). Goldens 88/99 and the 2 discovery reads on a no-change run are ruled (addendum 4).
- **Prior passes:** Codex adversarial 1 (BLOCK 5), 2 (BLOCK 1), 3 (BLOCK 1), 4 (PASS); `docs/harness/2026-10-10-codex-b1a-contract-adversarial*.md`. Loop end: only Blocking findings in normal use go to the lead; everything else is a v1 limit.

## Look hardest at

- One mechanism each: MOC regions in ownership-format; the selection validator; retrieval.json with its cursor in one write; maintain through the existing manifest/checkpoint/write-once; isHidden as the one hidden-path rule; VaultIndex for hub recognition and subtrees.
- Old notes, manifests and checkpoints keep their meaning; the app never writes the runner's .bower files; every content write passes the modifiedTime it read.
- Red repairs 1–7 each changed tests only per a ruling; nothing loosened beyond it.
- You may run `pnpm -C runner exec vitest run test/b1a-contract.test.ts --maxWorkers=2` with output to /tmp/p4-94-*.log.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
