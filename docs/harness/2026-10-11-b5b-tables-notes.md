# B5b table and proposal reds — 2026-10-11

implementer: codex

Tests-only session for `b5b-tables`, TL-P4-47 addendum 5. No production files, existing tests,
shared records, dependency directories, or B1d-owned files changed. No network calls, git writes,
commits, pushes, server, or e2e runs. The runner owns both commits listed in `.codex-commits.json`.

## Scope and evidence

Reuse: the versioned type-table reader and validators, `requestTableColumn`, the existing
`providerFor`/`ClaudeSpawn` seams, production `main`, `planScripted`, the shared run engine,
`answerQuestion`, B6a templates and `applyChanges`. Runtime tests use the existing in-memory
Drive v3 transport, not a replacement writer. Test data is made up.

The main-level proposal fixtures supply `Decisions.askAfter` through the existing provider seam;
main still admits, persists the manifest, applies effects and publishes questions. Context tests use
the actual Claude provider with its spawn callback. The typed-fact planner fixture returns
`typeRow` and `properties` alongside an authored Source at the existing `Decisions.note` seam;
HEAD ignores these additive fields, which is the tested failure. B1d's provider handoff remains
pending; no provider reply schema was changed. The eventual provider must carry those facts into
planning. Prompt evidence currently fails on the absent rendered table; exact position-2 integration
and semantic first-match execution still need verification against B1d's handed-off prompt shape.

The e2e fixtures replace only the source's vault with a real `DriveVault` over an in-memory Drive.
They boot the chosen demo/fake source and use production FolderScreen, note parsing and routing.
There are 52 new cases: 13 states on both sources at 375/1440. They cover the approved nine rows,
missing/unmatched/generic fallback, note majority, reversed-row tie, status, four columns, money,
lists/dates, numeric/date/amount sorting, empty-last both ways, existing controls, retained note
properties and WCAG 2.2 with target-size. They have NOT been executed or designer-verified.

## Research used locally

The packet supplied these sources; this session did not independently fetch or reverify them:

- Closed writes: https://json-schema.org/understanding-json-schema/reference/object#additionalproperties
- Currency codes: https://www.iso.org/iso-4217-currency-codes.html
- Date-only values: https://www.iso.org/iso-8601-date-and-time-format.html
- Tolerant stored reads: https://www.rfc-editor.org/rfc/rfc9413.html
- Existing provider validation: https://zod.dev/api

## Reds

All changes below are additions. No existing assertion, fixture, bound, tolerance or test was
weakened, replaced, deleted, skipped, or marked only.

tests changed: runner/test/b5-incorporation.test.ts: add real-main context, proposal lifecycle/capacity, table creation, authority, baseline and publication tests.

tests changed: runner/test/type-table.test.ts: append empty/all-invalid fallback, unknown-key rewrite and trusted column helper controls.

tests changed: src/data/spine/scripted.test.ts: append typed planner admission/refusal and landed grounding/read-only planning controls.

tests changed: src/data/spine/engine.test.ts: append read-to-act text/name/place checks and unchanged id-bound apply-once control.

tests changed: src/data/answer-loop.test.ts: append boolean-only proposal answers, instructions routing, no-run no and replay controls.

tests changed: src/data/vault/note-format.test.ts: append exact typed bounds, personal typed-note edits and B6a/legacy serialization controls.

tests changed: e2e/folder-table.spec.ts: append 52 approved-state screen cases; existing header/scroll test is unchanged.

| Exact name | Runtime | Passed | Expected assertion failures | Log |
| --- | --- | ---: | ---: | --- |
| `b5-first-row-controls-context` | runner | 1 | 1 | `/tmp/b5-first-row-controls-context-runner.log` |
| `b5-unknown-files-and-two-proposals` | runner | 1 | 5 | `/tmp/b5-unknown-files-and-two-proposals-runner.log` |
| `b5-proposal-yes-no-ignore-replay` | app | 4 | 0 | `/tmp/b5-proposal-yes-no-ignore-replay-app.log` |
| `b5-proposal-yes-no-ignore-replay` | runner | 3 | 3 | `/tmp/b5-proposal-yes-no-ignore-replay-runner.log` |
| `b5-document-cannot-teach-schema` | runner | 2 | 1 | `/tmp/b5-document-cannot-teach-schema-runner.log` |
| `b5-table-first-create-and-lenient-read` | app | 1 | 0 | `/tmp/b5-table-first-create-and-lenient-read-app.log` |
| `b5-table-first-create-and-lenient-read` | runner | 1 | 6 | `/tmp/b5-table-first-create-and-lenient-read-runner.log` |
| `b5-typed-property-bounds` | app | 13 | 12 | `/tmp/b5-typed-property-bounds-app.log` |
| `b5-explicit-column-replaces-fourth` | runner | 3 | 1 | `/tmp/b5-explicit-column-replaces-fourth-runner.log` |
| `b5-read-to-act-fence` | app | 4 | 0 | `/tmp/b5-read-to-act-fence-app.log` |
| `b5-landed-contract-compatibility` | app | 4 | 0 | `/tmp/b5-landed-contract-compatibility-app.log` |
| `b5-unused-baselines-removed` | runner | 1 | 1 | `/tmp/b5-unused-baselines-removed-runner.log` |
| `b5-folder-table-approved-states` | browser | Not run | Not run | Command below |

The named runs intentionally overlap for document authority / explicit columns. The complete
owned suites avoid double-counting: **app 335 passed / 12 expected failures; runner 50 passed /
17 expected failures**. All 29 failures are assertions on missing B5b behavior. No import,
collection, timer-gate or runtime exception is the cause of a failure. All separately named
baseline controls pass. This does NOT mean every packet-designated positive case passes:
exact yes installs once remains red until implementation; boolean yes routes
one instructions continuation and no starts none already pass in the answer loop.

Already-green requested groups: `b5-read-to-act-fence` (4/4) and
`b5-landed-contract-compatibility` (4/4). Those are regression guards, not fabricated failures.
Ignored proposals survive three later runs, changed frozen payloads are refused, nonboolean
answers are refused, manifest-before-question publication holds, and hot cannot grant consent.

Observed failures: no Markdown table in context; three proposals instead of two and more than
five open; duplicate payloads under different ids; missing immutable proposal files; yes does not
install the stored row; declined payload returns in a later run; seed fallback/first creation is
missing; unknown stored keys disappear; trusted column four stays unchanged and no truthful done
detail appears; typed facts are dropped and invalid facts reach planning; number/money bounds
are too loose; all three named unused production allowances remain.

### Every final failing case

- `src/data/spine/scripted.test.ts` — `b5-typed-property-bounds through planning retains all six valid declared values in the planned note`: AssertionError: expected [ 'type', 'created', 'updated', …(2) ] to deeply equal ArrayContaining{…}
- `src/data/spine/scripted.test.ts` — `b5-typed-property-bounds through planning refuses invalid undeclared facts before producing executable effects`: AssertionError: expected undefined to be an instance of BowerError
- `src/data/spine/scripted.test.ts` — `b5-typed-property-bounds through planning refuses invalid text facts before producing executable effects`: AssertionError: expected undefined to be an instance of BowerError
- `src/data/spine/scripted.test.ts` — `b5-typed-property-bounds through planning refuses invalid list facts before producing executable effects`: AssertionError: expected undefined to be an instance of BowerError
- `src/data/spine/scripted.test.ts` — `b5-typed-property-bounds through planning refuses invalid enum facts before producing executable effects`: AssertionError: expected undefined to be an instance of BowerError
- `src/data/spine/scripted.test.ts` — `b5-typed-property-bounds through planning refuses invalid number facts before producing executable effects`: AssertionError: expected undefined to be an instance of BowerError
- `src/data/spine/scripted.test.ts` — `b5-typed-property-bounds through planning refuses invalid money facts before producing executable effects`: AssertionError: expected undefined to be an instance of BowerError
- `src/data/spine/scripted.test.ts` — `b5-typed-property-bounds through planning refuses invalid currency facts before producing executable effects`: AssertionError: expected undefined to be an instance of BowerError
- `src/data/spine/scripted.test.ts` — `b5-typed-property-bounds through planning refuses invalid date facts before producing executable effects`: AssertionError: expected undefined to be an instance of BowerError
- `src/data/vault/note-format.test.ts` — `b5-typed-property-bounds rejects number above positive bound`: AssertionError: expected true to be false // Object.is equality
- `src/data/vault/note-format.test.ts` — `b5-typed-property-bounds rejects number below negative bound`: AssertionError: expected true to be false // Object.is equality
- `src/data/vault/note-format.test.ts` — `b5-typed-property-bounds rejects money five decimals`: AssertionError: expected true to be false // Object.is equality
- `runner/test/b5-incorporation.test.ts` — `b5-first-row-controls-context: offer and CV precede generic rows at prompt position 2`: AssertionError: the second context block is the rendered type table: expected '' to contain 'offer'
- `runner/test/b5-incorporation.test.ts` — `b5-unknown-files-and-two-proposals admits in item order with 0 earlier open cards`: AssertionError: expected [ 'lease', 'permit', 'receipt' ] to deeply equal [ 'lease', 'permit' ]
- `runner/test/b5-incorporation.test.ts` — `b5-unknown-files-and-two-proposals admits in item order with 3 earlier open cards`: AssertionError: expected [ 'old-0', 'old-1', 'old-2', …(3) ] to deeply equal [ 'old-0', 'old-1', 'old-2', …(2) ]
- `runner/test/b5-incorporation.test.ts` — `b5-unknown-files-and-two-proposals admits in item order with 4 earlier open cards`: AssertionError: expected [ 'old-0', 'old-1', 'old-2', …(4) ] to deeply equal [ 'old-0', 'old-1', 'old-2', …(2) ]
- `runner/test/b5-incorporation.test.ts` — `b5-unknown-files-and-two-proposals admits in item order with 5 earlier open cards`: AssertionError: expected [ 'old-0', 'old-1', 'old-2', …(5) ] to deeply equal [ 'old-0', 'old-1', 'old-2', …(2) ]
- `runner/test/b5-incorporation.test.ts` — `b5-proposal-yes-no-ignore-replay: exact yes installs frozen payload once and replay does not reopen`: AssertionError: expected [] to deeply equal [ { id: 'lease', …(4) } ]
- `runner/test/b5-incorporation.test.ts` — `b5-proposal-yes-no-ignore-replay: decline never returns while unrelated proposals remain eligible`: AssertionError: expected true to be false // Object.is equality
- `runner/test/b5-incorporation.test.ts` — `b5-table-first-create-and-lenient-read: seeds and first creation for null`: AssertionError: Target cannot be null or undefined.
- `runner/test/b5-incorporation.test.ts` — `b5-table-first-create-and-lenient-read: seeds and first creation for {"v":1,"rows":[]}`: AssertionError: expected [] to have a length of 8 but got +0
- `runner/test/b5-incorporation.test.ts` — `b5-table-first-create-and-lenient-read: seeds and first creation for {"v":1,"rows":[{"id":"bad"}]}`: AssertionError: expected [ { id: 'bad' } ] to have a length of 8 but got 1
- `runner/test/b5-incorporation.test.ts` — `b5-document-cannot-teach-schema / b5-explicit-column-replaces-fourth: trusted request reports its actual completed change`: AssertionError: expected [ 'company', 'salary', …(2) ] to deeply equal [ 'company', 'salary', …(2) ]
- `runner/test/b5-incorporation.test.ts` — `b5-unused-baselines-removed: no handed-off B5b production allowance remains`: AssertionError: expected [ …(3) ] to deeply equal []
- `runner/test/b5-incorporation.test.ts` — `b5-unknown-files-and-two-proposals: payload identity deduplicates different question ids`: AssertionError: expected [ 'lease', 'lease', 'permit' ] to deeply equal [ 'lease', 'permit' ]
- `runner/test/b5-incorporation.test.ts` — `b5-proposal-yes-no-ignore-replay: a later run deduplicates an ignored payload with a different id`: AssertionError: expected [ …(2) ] to deeply equal [ { id: 'q-proposal-lease', …(5) } ]
- `runner/test/type-table.test.ts` — `b5-table-first-create-and-lenient-read uses seeds when stored rows are empty`: AssertionError: expected { table: { v: 1, rows: [] }, …(1) } to deeply equal { …(2) }
- `runner/test/type-table.test.ts` — `b5-table-first-create-and-lenient-read uses seeds when stored rows are all invalid`: AssertionError: expected { table: { v: 1, rows: [] }, …(1) } to deeply equal { …(2) }
- `runner/test/type-table.test.ts` — `b5-table-first-create-and-lenient-read retains unknown stored envelope row and property keys when inserting a new accepted row`: AssertionError: expected { v: 1, rows: [] } to match object { v: 1, …(2) }

### Contradictions and allocations

The complete targeted suites were run, not stopped at the first red. No existing test failed or
contradicted these additions. The requested fence and compatibility groups are already green;
that differs from describing every named group as a failing red. The delivery is blocked on the
stronger requirement that every stated positive control pass: production does not yet install an
accepted row, create the initial table, retain all six typed values through planning, or execute the
trusted column request. The corresponding cases are left honestly red rather than weakened:

- `runner/test/b5-incorporation.test.ts:134` — exact-yes installation and replay.
- `runner/test/b5-incorporation.test.ts:165` — first table creation / seeds.
- `runner/test/b5-incorporation.test.ts:178` — trusted column replacement / truthful done detail.
- `src/data/spine/scripted.test.ts:345` — valid typed facts retained by the planner.

Tests and the commit manifest are ready, but resolving those positive cases needs the separate
implementation session; this tests-only authorization cannot turn them green. B1d's handoff is
still required for prompt-position and model schema integration. No new transport, writer,
consent store, maintain write or unallocated production mechanism was introduced.

`removed: none` — baseline removals belong to implementation. The baseline test is red for the
three landed allowances. Its positive control executes the actual unused gate against an OS-temp
fixture with a production caller, never scans the repository inside Vitest.

Calls/timing: the existing in-memory transport and read cache are used. Named performance call
or timing deltas were not measured; this is a red session, not the implementation performance gate.
Full corpus, method gates, `pnpm check`, e2e and designer verification remain for the runner /
implementation session. `pnpm check` was not run because its normal scripts emit repository reports.

## Exact verification

All test output and JSON reports are under `/tmp` (the OS temp directory's alias on this machine).
Temporary Vite configs set their cache directories there and disable Vitest's cache. The temporary
setup retains the original timer guard; it omits only the repository-writing CPU report block.
The repository's timer setup was not edited. No dependency directory was replaced or symlinked.

Configs: `/private/tmp/b5-app.config.mts`, `/private/tmp/b5-runner.config.mts`.
Recreation script: `/tmp/b5-configs.py`; named-run script: `/tmp/b5-run-named.py`.
App config also sets `server.fs.allow` to `/private/tmp` and `/Users/deluisp`, and uses canonical
`/private/tmp/b5-timer-setup.ts`, for Vite's filesystem access check on the temporary setup.

Each exact red was run separately with the following commands (stdout/stderr to its log above):

```sh
pnpm exec vitest run --config /private/tmp/b5-runner.config.mts --configLoader runner test/b5-incorporation.test.ts test/type-table.test.ts -t b5-first-row-controls-context --maxWorkers=2 --outputFile /tmp/b5-first-row-controls-context-runner.json > /tmp/b5-first-row-controls-context-runner.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-runner.config.mts --configLoader runner test/b5-incorporation.test.ts test/type-table.test.ts -t b5-unknown-files-and-two-proposals --maxWorkers=2 --outputFile /tmp/b5-unknown-files-and-two-proposals-runner.json > /tmp/b5-unknown-files-and-two-proposals-runner.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-app.config.mts --configLoader runner src/data/spine/scripted.test.ts src/data/spine/engine.test.ts src/data/answer-loop.test.ts src/data/vault/note-format.test.ts -t b5-proposal-yes-no-ignore-replay --maxWorkers=2 --outputFile /tmp/b5-proposal-yes-no-ignore-replay-app.json > /tmp/b5-proposal-yes-no-ignore-replay-app.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-runner.config.mts --configLoader runner test/b5-incorporation.test.ts test/type-table.test.ts -t b5-proposal-yes-no-ignore-replay --maxWorkers=2 --outputFile /tmp/b5-proposal-yes-no-ignore-replay-runner.json > /tmp/b5-proposal-yes-no-ignore-replay-runner.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-runner.config.mts --configLoader runner test/b5-incorporation.test.ts test/type-table.test.ts -t b5-document-cannot-teach-schema --maxWorkers=2 --outputFile /tmp/b5-document-cannot-teach-schema-runner.json > /tmp/b5-document-cannot-teach-schema-runner.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-app.config.mts --configLoader runner src/data/spine/scripted.test.ts src/data/spine/engine.test.ts src/data/answer-loop.test.ts src/data/vault/note-format.test.ts -t b5-table-first-create-and-lenient-read --maxWorkers=2 --outputFile /tmp/b5-table-first-create-and-lenient-read-app.json > /tmp/b5-table-first-create-and-lenient-read-app.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-runner.config.mts --configLoader runner test/b5-incorporation.test.ts test/type-table.test.ts -t b5-table-first-create-and-lenient-read --maxWorkers=2 --outputFile /tmp/b5-table-first-create-and-lenient-read-runner.json > /tmp/b5-table-first-create-and-lenient-read-runner.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-app.config.mts --configLoader runner src/data/spine/scripted.test.ts src/data/spine/engine.test.ts src/data/answer-loop.test.ts src/data/vault/note-format.test.ts -t b5-typed-property-bounds --maxWorkers=2 --outputFile /tmp/b5-typed-property-bounds-app.json > /tmp/b5-typed-property-bounds-app.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-runner.config.mts --configLoader runner test/b5-incorporation.test.ts test/type-table.test.ts -t b5-explicit-column-replaces-fourth --maxWorkers=2 --outputFile /tmp/b5-explicit-column-replaces-fourth-runner.json > /tmp/b5-explicit-column-replaces-fourth-runner.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-app.config.mts --configLoader runner src/data/spine/scripted.test.ts src/data/spine/engine.test.ts src/data/answer-loop.test.ts src/data/vault/note-format.test.ts -t b5-read-to-act-fence --maxWorkers=2 --outputFile /tmp/b5-read-to-act-fence-app.json > /tmp/b5-read-to-act-fence-app.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-app.config.mts --configLoader runner src/data/spine/scripted.test.ts src/data/spine/engine.test.ts src/data/answer-loop.test.ts src/data/vault/note-format.test.ts -t b5-landed-contract-compatibility --maxWorkers=2 --outputFile /tmp/b5-landed-contract-compatibility-app.json > /tmp/b5-landed-contract-compatibility-app.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-runner.config.mts --configLoader runner test/b5-incorporation.test.ts test/type-table.test.ts -t b5-unused-baselines-removed --maxWorkers=2 --outputFile /tmp/b5-unused-baselines-removed-runner.json > /tmp/b5-unused-baselines-removed-runner.log 2>&1
```

Complete owned suites, both with `--maxWorkers=2`:

```sh
pnpm exec vitest run --config /private/tmp/b5-app.config.mts --configLoader runner src/data/spine/scripted.test.ts src/data/spine/engine.test.ts src/data/answer-loop.test.ts src/data/vault/note-format.test.ts --maxWorkers=2 --outputFile /tmp/b5-app-suite.json > /tmp/b5-app-suite.log 2>&1
pnpm exec vitest run --config /private/tmp/b5-runner.config.mts --configLoader runner test/type-table.test.ts test/b5-incorporation.test.ts test/ask-answer-loop.test.ts --maxWorkers=2 --outputFile /tmp/b5-runner-suite.json > /tmp/b5-runner-suite.log 2>&1
```

Type checks pass with `pnpm exec tsc -p <config> --noEmit` for `tsconfig.app.json`,
`runner/tsconfig.json`, and `tsconfig.node.json` (app/node also `--incremental false`). Logs:
`/tmp/b5-app-types.log`, `/tmp/b5-runner-types.log`, `/tmp/b5-e2e-types.log`.
Scoped ESLint passes for all changed test files; logs `/tmp/b5-app-lint.log`,
`/tmp/b5-runner-lint.log`. ESLint needed explicit `--parser-options` `tsconfigRootDir` for each
package because the shared dependency installation detects multiple roots. No config was changed.
`git diff --check` passes; read-only diff shows no deleted lines in existing files.

## E2e command — not run

Each new test selects its own demo/fake source and 375/1440 viewport. Run the full owned file
(including its existing test), with OS-temp Playwright output and the heavy-run lock:

```sh
bash harness/with-lock.sh pnpm exec playwright test e2e/folder-table.spec.ts --project=desktop --workers=2 --reporter=line --output=/private/tmp/b5b-tables-playwright > /private/tmp/b5b-tables-e2e.log 2>&1
```

The command is recorded only. A later executor must keep the Vite development cache in OS temp
as well if retaining this session's no-repository-test-output constraint. No e2e pass or designer
approval is claimed.
