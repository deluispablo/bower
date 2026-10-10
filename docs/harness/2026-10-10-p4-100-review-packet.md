# Packet: P4-100 review (q1a-stored-answers, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-q1a-stored-answers`.

## What to review

- **Diff:** `git diff claude/p3...q1a-stored-answers -- src runner` (reds da758af6; red repairs 1–4; fix ddfba738; fix rounds 1–3 and fix 4 with their reds) with the notes `docs/harness/2026-10-10-q1a-stored-answers-notes.md`.
- **Contract:** the packet `docs/harness/2026-10-10-q1a-stored-answers-packet.md`; TL-P4-44 and addenda 1–5 (DECISIONS; the notes quote 4 and 5); the lead's rulings that an independent free request stays pending (C11) and that a loose Inbox file is its own member subject.
- **Prior passes:** Codex adversarial 1 (BLOCK 7), 2 (BLOCK 3), 3 (BLOCK 1, fixed by fix 4); `docs/harness/2026-10-10-codex-q1a-stored-answers-adversarial*.md`. The lead ended the loop: later non-normal findings are v1 limits.
- **Gates (coordinator):** pnpm check and e2e app/capabilities on demo and fake (results in the coordinator's message).

## Look hardest at

- An option is consent only for its stored file-to folder id; renamed or moved inside the roots still receives; gone or under the inbox: the subject waits and the next run re-asks as the next round, with no model placement before it.
- The answer value widens additively; old yes/no lines, questions.json, manifests and reports keep their meaning (compatibility rows).
- Rounds and exhaustion are per member (folder member, loose file, words-only pile); a pile-level asking counts for each covered member; only exhausted members are held; clear siblings file.
- Text answers are that subject's words only (typed provenance); the continuation keeps today's subject scope and one quota unit.
- The pile listing stays zero-read and takes the marker from the cached questions (addendum 3); no second store, counter or scheduler.
- The red repairs changed tests only per the rulings; goldens and fingerprints unchanged.
- You may run `pnpm -C runner exec vitest run test/q1-continuation.test.ts --maxWorkers=2` with output to /tmp/p4-100-*.log.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
