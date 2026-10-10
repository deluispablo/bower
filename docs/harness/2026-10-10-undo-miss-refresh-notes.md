# undo-miss-refresh implementation

implementer: codex

## Result

One bounded listing revalidation helper, `rulesForRemoval`, checks rule membership by id.
A hit returns the cached rules without listing Drive again. A miss calls the existing
`refresh()` once, then reads the rules again. `removeRule` decides `not-found` only after
that second lookup. The kept-suggestion Undo removal uses the same helper before its
existing `ruleSequence` call, so it has no separate freshness path.

FIFO, write-once reconciliation, `Journal.retract`, locking, and inverse records are unchanged.
No network calls, commits, or other Git writes were made. The coordinator owns the commits.

## Red evidence

Tests were added before any product change. The red run exited 1 with exactly two failed tests:

- `replays undo-compensate-counterexample`
  - Parameters: `{ seed: 752195386, path: '49', numRuns: 1, endOnFailure: true }`.
  - The unchanged property, mandatory spine, generator, oracle, and assertions reproduced
    the diagnosed command trace, with zero shrinks.
  - Assertion at `undo-compensate.property.test.ts:244`: expected
    `['offline', 'auth', 'unknown']` to include the unexpected `not-found`.
- `removeRule lists zero times on a hit and once on each miss`
  - The cached-hit positive control completed with zero extra `listAll` calls.
  - The genuinely missing id returned `not-found`, but its listing assertion failed:
    expected `listAll` to be called 1 time, got 0, at `drive-vault.test.ts:348`.
  - The test also covers a rule created by another page after the refreshed listing:
    removal succeeds with exactly one further listing, followed by a cached hit with no listing.

Both failures were assertions, not import, configuration, or load errors.
Neither red was changed after the product fix. Existing tests were neither changed nor removed.

Red command:

```sh
pnpm exec vitest run src/data/vault --maxWorkers=2 -t 'replays undo-compensate-counterexample|removeRule lists zero times on a hit and once on each miss' > tmp-logs/undo-miss-refresh-red.log 2>&1
```

## Green evidence

All requested checks exited 0:

```sh
pnpm exec vitest run src/data/vault --maxWorkers=2 > tmp-logs/undo-miss-refresh-vitest.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/undo-miss-refresh-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/undo-miss-refresh-tsc-node.log 2>&1
pnpm exec eslint src/data/vault/drive-vault.ts src/data/vault/drive-vault.test.ts src/data/vault/undo-compensate.property.test.ts > tmp-logs/undo-miss-refresh-eslint.log 2>&1
```

The vault run includes both exact red names above. Test output was kept in the logs;
only failure details were read. `pnpm check` and e2e were omitted as explicitly requested.

## Files per coordinator commit

- Red, tests only:
  - `src/data/vault/undo-compensate.property.test.ts`
  - `src/data/vault/drive-vault.test.ts`
- Fix, product code only:
  - `src/data/vault/drive-vault.ts`
- Notes, separate commit:
  - `docs/harness/2026-10-10-undo-miss-refresh-notes.md`

`tmp-logs/` contains local evidence and is not part of these commits.

removed: red — none; existing property and tests preserved.
removed: fix — direct cached-only rule reads at the two removal callers, replaced by the shared helper.
removed: notes — none.

## Standard and scope

The packet and diagnosis supply the standard: cache-aside revalidation of a cached miss,
using the existing listing mechanism. Source:
[Microsoft Cache-Aside pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside).
The external page was not fetched, respecting the no-network instruction.

Left out: broader cache freshness, UI changes, journal changes, integration, and commits.

tests changed: src/data/vault/drive-vault.test.ts: add the hit/miss listing-call red for removeRule (new test; nothing existing changed)
tests changed: src/data/vault/undo-compensate.property.test.ts: add the fixed replay of seed 752195386 path 49 beside the property (new test; property unchanged)
