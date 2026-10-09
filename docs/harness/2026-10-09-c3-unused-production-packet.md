# Packet: c3-unused-production (stage 3)

- **Entry:** `c3-unused-production` (tooling). Ruling: TL-P4-17 addendum 6, points 3 and 5 (DECISIONS). Worktree `/private/tmp/bower-c3-prod`, branch `c3-unused-production` from `claude/p3`.
- **Starting model:** `bower-implementer` (Sonnet).
- **Live evidence:** c3-unused-code's knip treats tests as entries, so a helper that only tests call (the `keepFinished` case, DEFECT_LOG `retention-never-wired`) is not caught.

## Contract

- **The script.** `scripts/check-unused-gate.mjs`, the tool's one home, also runs `knip --production` (tests are not entries).
- **The baseline.** That pass has its own shrink-only baseline, `harness/unused-production-baseline.json`, with the same rules as `harness/unused-baseline.json`.
- **Baseline contents.** Today's production findings, minus what this entry removes. `rateLimit`, `genericRateLimit` and `COOKIE_ROUTES` (api/src/security.ts) stay listed until `p4-rate-limits`.
- **Remove `isStale`** (api/src/process.ts). `ownDeadline` in recovery.ts is the one home of that rule.
- **Findings.** Any other production finding that a closed entry promises is logged as a defect for the lead, never deleted. List them on the card.

## Red

Fixture tests in `src/unused-gate.test.ts`. They use a sample tree only, never the real tool on the repo inside vitest (addendum 6).

## Verify (exact, from features.json)

`pnpm exec vitest run src/unused-gate.test.ts -t` with:
- "an export only tests call fails the production unused-code gate"
- "the production unused baseline may only shrink"

Then `pnpm check` must be green.

## Checklist

- Every printed message is backed by a test.
- The card names the exact tests, both baseline sizes, `removed: <lines>` and the defects found.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
