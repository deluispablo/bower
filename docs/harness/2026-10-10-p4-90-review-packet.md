# Packet: P4-90 review (p4-rate-limits, written by Codex and a Claude fix round)

This review is read-only and fresh. Do not run e2e, start a server or call the claude or codex CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-p4-rate-limits`.

## What to review

- **Diff:** `git diff claude/p3...p4-rate-limits -- api harness` (red 4dd6b6e2, fix 172bdc43, red repair 98174541, fix round 1).
- **Contract:** `docs/harness/2026-10-10-p4-rate-limits-packet.md` (lead ruling: /auth/* 20 per address, /drive/token 30 and /vault 60 per person per minute; 429 `rate-limited` with Retry-After; /process unchanged; staging-only binding; dry run only).
- **Prior passes:** `docs/harness/2026-10-10-codex-p4-rate-limits-adversarial.md` (BLOCK 3) and `-2.md` (PASS).

## Look hardest at

- One rate-limit mechanism; nothing counted before the checks that write nothing; keys (CF-Connecting-IP only; person after session).
- Production fails closed without a binding, with no test-only flag; the in-process harness's accepting doubles cannot mask a gap.
- wrangler.jsonc touches staging only; no production config; knip baselines only shrink.
- You may run `pnpm -C api exec vitest run test/rate-limits.test.ts --maxWorkers=2` with output to /tmp/p4-90-*.log.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
