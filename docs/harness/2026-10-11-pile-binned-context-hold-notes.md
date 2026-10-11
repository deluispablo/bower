# pile-binned-context-hold: red evidence

implementer: codex

Scope: red-owning session only. No production edits, git writes, commits, network access, or node_modules changes.

Research: reused the existing `BinnedOf` / `DriveApi.binnedByItem` mechanism. The local implementation in
`src/data/drive/drive-http.ts:305` queries `trashed = true` and exact `bowerItem` keys together. The standard
Drive file search supports this existing approach: https://developers.google.com/workspace/drive/api/guides/search-files.
This source was not fetched: the assignment forbids network access. No new Bin lookup mechanism is proposed.

tests changed: src/data/pile-readiness.test.ts: added shared app/capture agreement red; no existing assertion changed.
tests changed: src/data/spine/plan.test.ts: added adapter agreement and runner Bin-count tests; no existing assertion changed.
tests changed: src/data/vault/drive-vault.test.ts: added tidy-up red and removal/missing/Bin controls; no existing assertion changed.

## Names and results

Every name below starts with the required prefix `pile-binned-context-hold: `.

`src/data/pile-readiness.test.ts`:
- `pile-binned-context-hold: shared readiness never holds a Drive-binned note without an inbox reason` — RED.
  The app shows two ready PDFs and no reason; capture returns the not-arrived sentence instead of null.

`src/data/spine/plan.test.ts`:
- `pile-binned-context-hold: runner shares one Bin listing for a missing member and context` — RED.
  The one lookup contains the member key but omits the missing context key; capture still holds the pile.
  The exact one-call bound already passes; the fix must include both keys without a second listing.
- `pile-binned-context-hold: app and plan agree after Drive Bin` — RED.
  fakeRead, driveRead and admissionRead each hold the pile and omit its ready PDFs from admission.
- `pile-binned-context-hold: app and plan agree after journal trash` — PASS.
- `pile-binned-context-hold: app and plan agree after never arrived` — PASS.

`src/data/vault/drive-vault.test.ts`:
- `pile-binned-context-hold: a Drive-binned note leaves ready things filed with no silent hold` — RED.
  The real fake-stack tidy-up omits the pile from capture and its PDFs from the filed report; both stay in Inbox.
- `pile-binned-context-hold: journal trash still removes context for the app and the run` — PASS.
- `pile-binned-context-hold: a never-landed context stays not-arrived with ready things` — PASS.
- `pile-binned-context-hold: a never-landed context stays not-arrived with one missing thing` — PASS.
- `pile-binned-context-hold: a never-landed context stays not-arrived with things filed elsewhere` — PASS.
- `pile-binned-context-hold: a never-landed context stays not-arrived with context only` — PASS.
- `pile-binned-context-hold: missing context and member share one Bin listing and cached app readiness` — PASS.
  Two app listings cost exactly one root listing and one combined Bin lookup containing both keys.

## Fixtures and preserved assertions

The Drive Bin reds call FakeDrive.trash directly, without a journal line. Each keeps ready things in the pile.
The journal control directly stores a valid v1 trash record for the context path after binning that note.
The app's Inbox trash action bins the whole pile, so it cannot create this control fixture.
Never-landed controls remove only the context from the in-memory snapshot, using E3's contextNeverCreated
shape; they assert no Bin evidence and keep the app and run at not-arrived.

Existing E3 fixtures remain unchanged at src/data/vault/drive-vault.test.ts:1342, :1400, :2132 and :3372.
The existing Home Drive-call golden at src/data/vault/drive-vault.test.ts:3071 passes unchanged.
Contradicting existing assertions: none found in the full three-file run. All 238 pre-existing tests pass.

## Verification

Full command:
`pnpm exec vitest run src/data/pile-readiness.test.ts src/data/spine/plan.test.ts src/data/vault/drive-vault.test.ts --maxWorkers=2 --cache=false --fsModuleCache=false --configLoader=runner`

Result: exit 1, 4 intentional assertion-red tests and 246 passing tests (250 total).
Log: `/tmp/pile-binned-context-hold-red.log`.
The packet's filtered verify used the same options plus `-t pile-binned-context-hold`:
exit 1, 4 intentional reds, 8 passing controls, 238 tests excluded by the name filter.
Filtered log: `/tmp/pile-binned-context-hold-verify.log`.
Caches are disabled and the runner config loader avoids a bundled config file in node_modules.
All fixture writes are to FakeDrive's memory; output logs are in the OS temp folder.
`git diff --check` passes.

Implementation, pnpm check and Inbox e2e are left to the implementation session, as this assignment owns only reds.


## Implementation

The shared `contextRemoved` predicate now accepts the context Bin evidence and returns true for either
that evidence or the existing exact-path journal trash record. App readiness, orphan recovery, context
restoration and runner capture all use it. Missing context and missing members are resolved together by
`observePile` through the existing `BinnedOf` lookup. `Readiness.contextBinned` carries that evidence;
the app retains its existing per-snapshot Bin cache and the runner uses the same accounting result.

removed: `observeAll`, folded into `observePile` to make one combined Bin query.
removed: app-only missing-context key augmentation and separate Bin-result interpretation.
removed: orphan recovery's second context Bin listing.
removed: app readiness's direct `contextBinned` removal shortcut outside the shared predicate.
tests changed: none

No network, git writes, commits, test edits, or node_modules replacement/symlinking.
Research reused the packet's local `BinnedOf` / `DriveApi.binnedByItem` implementation and its existing
Drive files-search reference: https://developers.google.com/workspace/drive/api/guides/search-files.
The reference was not fetched because the assignment prohibits network access.

Initial test commands revealed that `harness/timer-gate-setup.ts` writes CPU reports to `test-results/cpu`.
The running data and runner commands were interrupted; this session's initial CPU artifacts were moved
into `/tmp/pile-binned-context-hold-initial-cpu`. Subsequent tests use the temporary Node preload
`/tmp/pile-binned-context-hold-report-paths.mjs` to redirect only these report mkdir/write operations to
`/tmp/pile-binned-context-hold-test-artifacts`. Committed tests and setup files remain unchanged.
Vitest caches are disabled; runner configuration loading avoids generated config bundles.

Verification:
- Red before implementation: 4 failed assertions, 8 passing controls; log
  `/tmp/pile-binned-context-hold-implementation-red.log`.
- Packet filtered reds after implementation: 12 passed, 238 excluded; log
  `/tmp/pile-binned-context-hold-green.log`.
- Runner full suite: 45 files, 599 tests passed; log `/tmp/pile-binned-context-hold-runner.log`.
- TypeScript app/node/runner passed with `--noEmit --incremental false`; logs
  `/tmp/pile-binned-context-hold-tsc-{app,node,runner}.log` (empty on success).
- ESLint on the three touched production files passed; log `/tmp/pile-binned-context-hold-eslint.log`.
- `git diff --check` passed; git commands were read-only.

`pnpm check` is not run: its scripts write repository test results, builds and a check mark, conflicting
with the user's requirement that tests never write into the repository. The requested explicit gates
are run individually with outputs in OS temp. Inbox fake e2e uses temporary configuration files with
its Vite cache, Playwright output and log in OS temp, through the shared heavy-run lock.

- Full data suite: 80 files, 4241 tests passed, including unchanged Drive-call goldens and E3 controls;
  log `/tmp/pile-binned-context-hold-data.log`.
- Contradicting tests: none in the targeted, full data or runner suites.

Data command: `NODE_OPTIONS=--import=/tmp/pile-binned-context-hold-report-paths.mjs pnpm exec vitest run src/data --maxWorkers=2 --cache=false --fsModuleCache=false --configLoader=runner`.
Runner command (from `runner/`): `NODE_OPTIONS=--import=/tmp/pile-binned-context-hold-report-paths.mjs pnpm exec vitest run --maxWorkers=2 --cache=false --fsModuleCache=false --configLoader=runner --reporter=default`.
Inbox command: `E2E_SOURCE=fake bash harness/with-lock.sh pnpm exec playwright test -c /tmp/pile-binned-context-hold-playwright.config.mts inbox-first.spec.ts`.

- Inbox fake e2e: blocked before any test ran. The sandbox refused the Vite local server bind at
  `::1:6740` with `listen EPERM: operation not permitted`; log `/tmp/pile-binned-context-hold-e2e.log`.
  The first temporary `.ts` config attempt failed module loading before starting a server; switching
  that scratch config to `.mts` resolved it. No repository config or test was edited.

Implementation is complete; packet integration gates remain outstanding: Inbox fake e2e needs an
execution environment that permits a local server, and standard `pnpm check` needs repository writes.
The coordinator can review the owned working-tree diff; no commits were made by explicit instruction.
