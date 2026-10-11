# Packet: P4-99 review (upload-resume-after-reload, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-upload-resume-after-reload`.

## What to review

- **Diff:** `git diff claude/p3...upload-resume-after-reload -- src` (reds dd0b8dfb; red repairs 729fa07e, 9c059527; fix dfa2f8de; fix rounds 1–3 with their reds and the fixture repair bca0212d) with the notes `docs/harness/2026-10-10-upload-resume-after-reload-notes.md`.
- **Contract:** the packet `docs/harness/2026-10-10-upload-resume-after-reload-packet.md`; TL-P4-53 Q2, Q5, Q6 and addenda 3–4 (DECISIONS); the prep `docs/harness/2026-10-10-c02-upload-prep.md`.
- **Prior passes:** Codex adversarial 1–3 (BLOCK 1 each), 4 (PASS); `docs/harness/2026-10-10-codex-upload-resume-after-reload-adversarial*.md`. The lead ended the loop at round 3: later non-normal findings are v1 limits.
- **Gates (coordinator):** pnpm check green; e2e app, capabilities and capabilities-b on demo (35) and fake (59).

## Look hardest at

- Every accepted member staged on the device before saved; after a reload, an ambiguous answer, a halt, a Bin, an Undo or a "Use here" takeover, never a second file and no picker for retained bytes.
- One decision point for queue state and file snapshot; a member completed by any tab stays in flight until its arrival is known; the broadcast change is backward compatible.
- A vanished destination is held, never recreated; limits and the memory fallback unchanged; sign-out untouched (another entry).
- One mechanism each (queue, store, write-once read-back, session fencing); the red repairs loosened no point.
- You may run `pnpm exec vitest run src/data/upload-resume.test.ts src/data/upload-queue.test.ts --maxWorkers=2` with output to /tmp/p4-99-*.log.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
