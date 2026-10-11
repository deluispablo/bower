# Packet: P4-96 review (smoke-request-slow, escalated, written by Codex)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-smoke-request-slow`.

## What to review

- **Diff:** `git diff claude/p3...smoke-request-slow -- src runner` (reds; red repairs 1–5 incl. the TL-P4-51 sweep; fix 4286793b; fix rounds 1 and 2) with the notes `docs/harness/2026-10-10-smoke-request-slow-notes.md`.
- **Contract:** the packet `docs/harness/2026-10-10-smoke-request-slow-packet.md`; the lead's smoke-request-slow ruling and rounds 2–5, TL-P4-51 (DECISIONS); TL-P4-32 and addenda 2–6 (C05 settlement); DEFECT_LOG fake-drive-snapshot-feed.
- **Prior passes:** Codex adversarial 1 (BLOCK 1), 2 (BLOCK 1), 3 (PASS); `docs/harness/2026-10-10-codex-smoke-request-slow-adversarial*.md`. Loop end: only Blocking findings in normal use go to the lead; everything else is a v1 limit (the plan.ts:134 archived scan for a declared pile whose context was removed outside Bower is one).
- **Gates (coordinator):** pnpm check green; e2e c05-person-notes, capabilities, capabilities-b and app pass on demo (51) and fake (75).

## Look hardest at

- No second append or completion on any supported path (crash points: pointer publication, append, relocation, archive; redispatch).
- One rule for which run a waiting request belongs to (`waitingRun()`), used everywhere; the pointer wins over the folder.
- New requests 0 record reads; a waiting request reads only its own run with found's full chain check; no archive scan; horizon from listing creation time.
- One mechanism each (the existing move effect, RunRecords); the red repairs changed tests only per the rulings and loosened no point; the driver's replay never hand-restores.
- Old stored data keeps its meaning (the compatibility row); the fake snapshot fix is test-double only.
- You may run `pnpm -C runner exec vitest run test/c05-bounded-reads.test.ts test/c05-person-notes.test.ts --maxWorkers=2` with output to /tmp/p4-96-*.log.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
