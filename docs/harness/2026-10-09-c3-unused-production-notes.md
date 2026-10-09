# c3-unused-production notes

- Source: https://knip.dev/features/production-mode (production entries carry `!`; tests are then not entries).
- knip.jsonc: `!` added to the production entries and project globs of the three workspaces; the normal pass is unchanged.
- scripts/check-unused-gate.mjs runs a second pass `--production` against harness/unused-production-baseline.json. With `--baseline` alone only the first pass runs (the fixture tests).
- Removed: `isStale` (api/src/process.ts), the stale-rule's second home; recovery.ts `ownDeadline` stays.
- Baseline: 35 lines (harness/unused-baseline.json goes 5 to 4), all of today's production findings minus isStale.
  - Files: test support (src/testing, contract helpers, fixtures) that only tests or e2e import; expected under production mode.
  - Kept until p4-rate-limits: rateLimit, genericRateLimit, COOKIE_ROUTES.
- Defect candidates for the lead (exports only tests call, not deleted):
  - api/src/github.ts dispatchTidy (only api/test/dispatch.test.ts calls it: is the live dispatch wired elsewhere?).
  - src/data/session.ts LEASE_TTL_MS (a second copy next to contracts/lease.ts?).
  - src/data/contracts/note-edit.ts undoEdit, undoChanges; src/data/contracts/run-checkpoint.ts parseRunReport; src/data/spine/read.ts driveRead.
  - api/src/env.ts OPTIONAL_SECRETS (docs test and env test only).
  - src/features/piles/add-words.ts leftOut; src/data/contracts/hashes.ts EMPTY_SHA256 (test only).
