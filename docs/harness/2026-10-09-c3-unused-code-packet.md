# Packet: c3-unused-code (stage 3)

- **Entry:** `c3-unused-code` (tooling). Ruling: TL-P4-17 entry 4 ([doc](2026-10-09-tl-p4-17-stage-2-pattern-review.md)). Worktree `/private/tmp/bower-c3-knip`, branch `c3-unused-code` from `claude/p3`.
- **Starting model:** `bower-implementer` (Sonnet).
- **Live evidence:** DEFECT_LOG `retention-never-wired`. `keepFinished` had no production caller, and a closed entry promised it.

## Contract

- **Add knip** (https://knip.dev) as a devDependency, configured for the three workspaces: the root app, `api/` and `runner/`.
  - Entry points must match production: the Vite app, the Worker, the runner's `main`, the scripts, the tests and the e2e specs.
  - Every entry or ignore in the knip config carries a one-line reason.
- **Gate.** `scripts/check-unused-gate.mjs` follows the shape of `scripts/check-duplication-gate.mjs` and runs in `pnpm check` after the duplication gate.
  - It fails on any finding not in `harness/unused-baseline.json`.
  - It fails when the baseline gains an entry (the list may only shrink).
  - Baseline = today's findings minus what this entry removes.
- **Removals.** Remove what knip finds dead and what is clearly dead (unused exports, files, dependencies), only when removal changes no behaviour.
  - Anything in `src/data/contracts`, any Drive write path, or anything a closed entry promises goes under "left out" with a reason, not removed.
  - A dead helper a closed entry promised is a defect to log, not to delete. Report it on the card.
- No change to app behaviour. The goldens never rise. A compatibility row is needed for any non-merge commit under `src/features` or `src/data/contracts` (`src/docs.test.ts`).

## Red

Fixture tests in `src/unused-gate.test.ts`, failing today because the gate is missing:
- a sample tree with a new unused export fails the gate;
- adding a baseline entry fails.

## Verify (exact, from features.json)

`pnpm exec vitest run src/unused-gate.test.ts -t` with:
- "a new unused export fails the unused-code gate"
- "the unused baseline may only shrink"

Then `pnpm check` must be green, and `pnpm e2e:fake` too if any fixture, demo or fake file is removed.

## Checklist

- Tests use a fixture tree, never a scan of the repo inside vitest (TL-P4-17 addendum 4).
- Every printed message is backed by a test.
- The card names the exact verify tests, the baseline size, `removed: <lines>`, and the defects found.
- Reviewers: read-only, never `git checkout` in the main repo.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
