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


## Implementation

implementer: codex

Status: **blocked; partial production patch, not an accepted B5b implementation**.
Base: `b7aeca4e6351179909ff6ade4a813b9a5dd1c43a`. B1d is integrated and was not
used as an ownership blocker. No network, git writes, dependency replacement, e2e,
server, or `pnpm check` execution. The runner owns committing and those final gates.

### Changes within the owned files

- `runner/src/type-table.ts`: empty/all-invalid readable tables use eight seeds; stored
  envelope, row, property and grouping extension keys survive reads and insertion.
  Newly inserted rows still pass the strict validator. Invalid known fields still fail.
- `src/data/contracts/note-format.ts`: the existing row validator accepts an explicit
  stored-read mode; normal table/proposal writes remain closed. Numbers are finite and
  within ±1e15. Money remains ISO-currency validated and has at most four decimals.
  Reads of personal notes, the scalar serializer and B6a ownership remain unchanged.
- `runner/src/claude.ts`: render the already-read rows as Markdown between the fixed
  instructions and JSON context, preserving stored order and escaping cell separators.
  No additional Drive read, model call, writer, consent store or maintain effect.
- Removed the helper without a production caller, as the handoff directs. Its older
  test is preserved under the user's explicit no-test-edit instruction; conflict below.

removed: runner/src/type-table.ts: firstMatchingRow, which had no production caller.
removed: harness/unused-production-baseline.json: firstMatchingRow finding and reason.
removed: harness/unused-baseline.json: none; it contains only the unrelated phase alias allowance.
removed: remaining B5b production allowances: none; insertTypeRow, requestTableColumn,
propertyValuesOk and tableProperties still lack production callers. Deleting their allowances
would misrepresent the remaining work and fail the unused gate.

tests changed: none; all existing assertions, fixtures and bounds are preserved.

### Required scope resolution

1. **Create-when-absent cannot be represented by the permitted contract.**
   `src/data/contracts/run-manifest.ts:40` requires `before: SeenFile` and a verified
   existing body. Its shape guard at line 317 requires both, and
   `planningArtifactsOk` at lines 718–729 rejects a type-table `create-text` fallback.
   The packet's addendum 5 requires create-when-absent in `write-runner-json`, but this
   B4a contract file is absent from Owned files and the user explicitly forbids editing
   B4a contracts beyond that list. `engine.ts` alone cannot fix this. Allocation must
   cover the contract and its existing consumers, including scheduler claims
   (`src/data/spine/schedule.ts:48`), engine recovery, runner admission checks
   (`runner/src/spine/admitted.ts:130`) and their contract tests. No fake SeenFile,
   bypass of validation, pre-manifest write or alternate creation mechanism was added.
2. **The Table has no public path to the required runner-file read.**
   `VaultSource` in `src/data/sources.ts` exposes `questions()` and `note()`, but no
   declaration/runner-file read. `DriveVault.questions()` uses its private JSON reader
   (`src/data/vault/drive-vault.ts:1608`). Neither this source interface nor DriveVault
   appears in Owned files. They need allocation to expose the same read mechanism,
   plus the required source implementations and fixtures. FolderScreen was not given
   a Drive bypass, cast to private internals, or a second parser/transport.
3. **Stored extensions still cannot pass the existing manifest write guard.**
   The new tolerant reader/insertion preserves them, but
   `src/data/contracts/run-manifest.ts:725` still calls strict `typeTableOk` on the
   entire rewritten table. The strict/new versus stored/rewrite boundary needs the
   same contract allocation; weakening `typeTableOk` globally would violate the
   closed-write and proposal tests. The partial patch does not claim a persisted
   unknown-key rewrite works.

The worker rule is to use the named mechanism and report blocked if it cannot perform
what is needed (`.agents/skills/bower-implement/SKILL.md` delegates to
`docs/harness/WORKER.md`: "if it cannot do what you need, stop and report `blocked`").
The direct user ownership restriction is the blocker, not a request for repeated approval.

### Contradictions (TL-P4-51)

- `runner/test/type-table.test.ts:57`, assertions at lines 69–71: requests and exercises
  `firstMatchingRow`, while the packet's handoff explicitly directs its removal when
  unused. The helper is removed; the test is not edited. This test remains red.
- `runner/test/b5-incorporation.test.ts:94`: expects exactly one Claude callback, while
  landed B1d executes selection then generation. Its callback reconstructs
  `replySequence` per call. Before and after this patch the two-item fixture is refused
  at the frozen selection, before the Markdown assertion. The run's earlier failure is
  not claimed as evidence that the new rendering is wrong, nor was B1d loosened to
  satisfy an older single-call assertion. This needs a test ruling/updated red session.

Remaining proposal admission/deduplication, immutable artifacts, installation, decline
lookup, trusted column execution, typed planner facts and Table UI are **not implemented**.
Some are independently implementable, but work stops at the explicit contract/test
contradictions rather than introducing another mechanism. Full-suite failures are listed
below; the patch is not ready for integration.

### Compatibility draft

| Changed home | Contract change | Existing stored data / callers | Evidence |
| --- | --- | --- | --- |
| `src/data/contracts/note-format.ts` row validation | Explicit tolerant mode retains unknown stored keys; strict remains default | Existing strict callers keep closed objects; `typeTableOk` explicitly calls strict mode | type-table stored-extension and strict-write tests; app run-manifest/questions suites |
| `src/data/contracts/note-format.ts` number validation | Reject outside ±1e15 and nonfinite values | Note parsing/serialization is unchanged; new typed facts must meet the ruled bounds | b5-typed-property-bounds positive and negative cases |
| `src/data/contracts/note-format.ts` money validation | Reject amounts with more than four decimal places; retain one ISO currency validator | Stored scalar reads unchanged; applies at typed-value admission | b5-typed-property-bounds and B5a typed-value bounds |

Research: reused the packet's locally cited JSON Schema closed objects, ISO 4217,
ISO dates, RFC 9413 and Zod references listed above; none fetched or independently
reverified. Scope reviewed: row validator callers, proposal guard, manifest guards,
provider prompt, planner, engine, scheduler, source interface, DriveVault and Table.
No new abstraction, dependency, schema-consent channel or fixture was added.

Call/count delta by inspection: zero new I/O and zero new model calls in this patch;
the Markdown adds prompt bytes only. End-to-end timing growth is not established by
mock-clock unit runs; no measured performance acceptance or designer verification is claimed.


## Implementation — continuation from aa54844f

implementer: codex

Status: **blocked; independently completed typed-fact path, not ready for integration**.
The complete requested suites were run. No repository test, assertion, fixture, bound,
dependency directory or unowned production file was changed. No network, git write,
server, e2e or pnpm check execution. The runner owns the two commits described in
`.codex-commits.json` and its later check/e2e runs.

### Completed within the allocated homes

- Reused the WIP's tolerant versioned reader, seed order, extension preservation and
  numeric/currency/date guards. Moved the reader (not a copy) into the existing shared
  note-format contract, with its original runner export re-exported. This lets the
  shared planner consume declarations without importing runner code or adding a parser.
- The planner captures the declaration read once per plan. Authored notes may name a
  stored row and supply declared facts. Unknown rows, undeclared fields and invalid
  values refuse the plan before any executable effects. All six valid bounded kinds
  survive into the planned note, including list and money JSON scalar values.
- The existing template serializer accepts an explicitly validated row classification;
  `type` holds its row id and `bower_template` still holds the B6a template. It defaults
  the type to that row when the caller omits the property. Existing template-only,
  personal-note and legacy reads retain their paths. No Source edit authority was added.
- Claude's existing closed note shape carries the optional row id and facts. The shared
  value validator handles their bounds, the existing numeric grounding check also checks
  facts, and execution binds the row id to the frozen selection kind. The single existing
  authored-link grounding check now includes facts and inferred templates.
- The position-2 Markdown declaration remains. Replaced the duplicate fixed list of
  document kinds with the declared precedence and the original payslip example. The
  existing method and C04 prompt suites pass, including the unchanged 9,000 bound.

removed: runner/src/type-table.ts: local readTypeTable/seedTable definitions, moved to the shared contract once.
removed: harness/unused-production-baseline.json: propertyValuesOk allowance; the planner/provider now call it.
removed: harness/unused-baseline.json: none; no named B5b row is present there.
removed: runner/src/type-table.ts: whole-file allowance was already absent after B1d; no further row to remove.
removed: firstMatchingRow: already removed by aa54844f; still no production caller; no test changed.
removed: insertTypeRow/requestTableColumn/tableProperties allowances: none; these still have no production caller.

tests changed: none in the repository. Two OS-temp provider self-checks were created and run; not committed.

### Concrete remaining scope blockers

The packet's existing owned list still cannot represent the required complete path:

1. `src/data/contracts/run-manifest.ts:40,317` requires an existing `before` and
   `beforeContent` for every write-runner-json. Its planning guard at 729 explicitly
   rejects a type-table create-text. Create-when-absent therefore needs that unowned
   B4a contract and its effect consumers allocated. Engine-only edits would invent
   evidence or bypass the contract. None were made.
2. `src/data/contracts/run-manifest.ts:725` still validates a whole rewrite with strict
   typeTableOk. Stored extensions preserved by the reader cannot pass that write guard.
   The needed strict-new/lenient-rewrite distinction belongs at this unowned boundary;
   globally weakening typeTableOk would violate the strict-write controls.
3. `src/data/spine/grounded.ts:158-159` allows runner-json creates only for requests,
   hashes and questions. It rejects every required immutable proposal create, even
   though planningArtifactsOk separately recognizes proposals. This unowned existing
   grounding mechanism also needs allocation; a second writer or an alternate purpose
   on the effect would bypass its authority. Proposal admission/installation/decline
   and trusted column execution are not completed in this partial patch.
4. `src/data/sources.ts` exposes no declaration read and
   `src/data/vault/drive-vault.ts:1608` keeps the existing runner JSON reader private.
   Neither is owned. FolderScreen cannot load declarations through the ruled shared
   questions-file read without allocation of the source interface and implementations.
   No private-field cast, Drive bypass, second transport or partial Table UI was added.

These are the direct user ownership restriction and existing mechanism boundaries, not
new permission requirements. The worker rule also states "if it cannot do what you need,
stop and report blocked" in [WORKER.md](WORKER.md), used by
[bower-implement](../../.agents/skills/bower-implement/SKILL.md). The independently
implementable typed-fact work and requested gates were completed before delivery.

### Contradictions and other gate failures (TL-P4-51)

Every targeted and full suite was run; no assertion was changed to obtain green.

- `runner/test/type-table.test.ts:53,66-68` requires firstMatchingRow, contradicting the
  handoff's removal of that helper when unused. The permitted helper removal remains;
  this older test is preserved.
- `runner/test/b5-incorporation.test.ts:86-94` recreates replySequence at each callback
  and asserts one call. Landed B1d has selection then execution. The two-item fixture
  fails at frozen selection before its Markdown assertions. The corrected OS-temp
  real-main control uses both phases and passes; no change to this older red is made.
- `runner/test/model-input-fingerprint.test.ts:100,112` pins old C04 prompt goldens.
  The required position-2 table changes those bytes. The goldens are unallocated and
  unchanged; both failures are disclosed.
- `src/architecture.test.ts:154,166` scans raw code strings for browser-global names.
  The required seed strings `identity-document` and `identity document` at
  `src/data/contracts/note-format.ts:530` match its `document` regex. Both tests report
  this pure contract as impure despite empty outside/external lists. This is a new
  failure from moving the one reader into the required shared home, and a contradiction
  with the required seed content, not browser code. No string-obfuscation workaround or
  test weakening was introduced.
- `src/docs.test.ts:134` already failed before this continuation: accepted compatibility
  records do not list WIP aa54844f. The shared compatibility ledger is unowned; draft
  rows for the current contract changes are below for the lead.
- `src/e2e-port.test.ts` has the expected EPERM failure and associated unhandled error
  from the sandbox refusing a local listen. No server or e2e was started manually.

### Compatibility draft

| Changed home | Contract change | Stored data / callers | Evidence |
| --- | --- | --- | --- |
| src/data/contracts/note-format.ts: readTypeTable | Moves the versioned reader into the shared contract; original runner API re-exported | One parser, same eight seeds and fallback/writeAllowed semantics; stored extension keys retained | complete runner type-table suite except retired-helper test; typed planner tests |
| src/data/contracts/note-format.ts: propertyValuesOk | Validate facts against a leniently read row, while new row/table writes remain strict | Unknown declaration extensions may survive reads; known fields and all six value bounds still enforced | b5-typed-property-bounds positive/negative cases; strict table write tests |
| src/data/contracts/note-format.ts: serializeNote/NoteFile | Optional validated typeRow sets classified type while retaining B6a template marker | Existing callers omit it and keep previous behavior; personal and legacy reads remain unchanged | owned note-format/grounding suites; real-main inferred Source self-check |

### Verification and call counts

All logs, Vitest JSON, cache files and scratch self-checks are in OS temp. The temporary
configs recorded in the red notes remain in use: Vite cache/output point there, and the
setup keeps the unchanged real-timer guard while omitting only repository CPU reports.
No repository config or timer setup was edited, and no node_modules replacement occurred.

- Complete runner: `pnpm -C runner exec vitest run --config /private/tmp/b5-runner.config.mts
  --configLoader runner --maxWorkers=2`; **725 passed, 17 failed**, 58 files.
  Log `/private/tmp/b5b-runner.log`; JSON `/private/tmp/b5-runner-results.json`.
  Full corpus, method, B5a/B6a and answer-loop tests are included in this run.
- Complete src: `pnpm exec vitest run src --config /private/tmp/b5-app.config.mts
  --configLoader runner --maxWorkers=2`; **5776 passed, 4 failed, one associated error**,
  172 files. Log `/private/tmp/b5b-src.log`; JSON `/private/tmp/b5-app-results.json`.
  The four failures are the two architecture string matches, WIP ledger row and expected
  e2e-port EPERM listed above. All typed planner reds now pass.
- Owned app suites: scripted, engine, answer-loop, note-format: **347/347 pass**;
  `/private/tmp/b5b-owned.log`, `/private/tmp/b5b-owned.json`. Rerun after the final
  serializer default adjustment; full src ran before that final one-line adjustment.
- OS-temp provider self-checks: **2/2 pass**; `/private/tmp/b5b-provider-selfcheck.log`.
  One exercises optional facts, undeclared facts, unknown rows and invented numeric facts
  through intentOf. One exercises the real main, selection, execution, planning,
  persistence and inferred Source creation without a template hint. It observes exactly
  **2 model calls and 1 type-table media read**, shared between selection and planning.
  No additional model call or second table fetch is introduced by the typed-fact path.
  No measured wall-time acceptance or before/after total-call delta is claimed.
- tsc app/node/runner: pass; `/private/tmp/b5b-app-types.log`,
  `/private/tmp/b5b-node-types.log`, `/private/tmp/b5b-runner-types.log`.
- ESLint on all touched TS files: pass; `/private/tmp/b5b-lint.log`.
- `node scripts/check-unused-gate.mjs`: pass, normal 1/1 and production 28/28;
  `/private/tmp/b5b-unused.log`. The three remaining B5b allowances reflect unfinished
  production callers, so removing them would make this gate fail.
- `git diff --check`: pass. No repository tests changed.

No pnpm check, e2e, designer verification, deployment, live network check or measured
performance acceptance is claimed. This delivery cannot be accepted until the remaining
scope blockers and preserved contradictory tests are resolved.

Research: reused only the packet's local closed-JSON, ISO 4217/8601, RFC 9413 and Zod
citations above; no network or independent reverification. No new dependency, abstraction,
writer, consent store or maintain write was added.

### Every remaining runner failure

- `runner/test/b5-incorporation.test.ts` — `b5-first-row-controls-context: offer and CV precede generic rows at prompt position 2`: AssertionError: real main completed: expected 1 to be +0 // Object.is equality
- `runner/test/b5-incorporation.test.ts` — `b5-unknown-files-and-two-proposals admits in item order with 0 earlier open cards`: AssertionError: expected [ 'lease', 'permit', 'receipt' ] to deeply equal [ 'lease', 'permit' ]
- `runner/test/b5-incorporation.test.ts` — `b5-unknown-files-and-two-proposals admits in item order with 3 earlier open cards`: AssertionError: expected [ 'old-0', 'old-1', 'old-2', …(3) ] to deeply equal [ 'old-0', 'old-1', 'old-2', …(2) ]
- `runner/test/b5-incorporation.test.ts` — `b5-unknown-files-and-two-proposals admits in item order with 4 earlier open cards`: AssertionError: expected [ 'old-0', 'old-1', 'old-2', …(4) ] to deeply equal [ 'old-0', 'old-1', 'old-2', …(2) ]
- `runner/test/b5-incorporation.test.ts` — `b5-unknown-files-and-two-proposals admits in item order with 5 earlier open cards`: AssertionError: expected [ 'old-0', 'old-1', 'old-2', …(5) ] to deeply equal [ 'old-0', 'old-1', 'old-2', …(2) ]
- `runner/test/b5-incorporation.test.ts` — `b5-proposal-yes-no-ignore-replay: exact yes installs frozen payload once and replay does not reopen`: AssertionError: expected [] to deeply equal [ { id: 'lease', …(4) } ]
- `runner/test/b5-incorporation.test.ts` — `b5-proposal-yes-no-ignore-replay: decline never returns while unrelated proposals remain eligible`: AssertionError: expected true to be false // Object.is equality
- `runner/test/b5-incorporation.test.ts` — `b5-table-first-create-and-lenient-read: seeds and first creation for null`: AssertionError: eight fallback seeds survive into the stored table: expected [] to have a length of 8 but got +0
- `runner/test/b5-incorporation.test.ts` — `b5-table-first-create-and-lenient-read: seeds and first creation for {"v":1,"rows":[]}`: AssertionError: eight fallback seeds survive into the stored table: expected [] to have a length of 8 but got +0
- `runner/test/b5-incorporation.test.ts` — `b5-table-first-create-and-lenient-read: seeds and first creation for {"v":1,"rows":[{"id":"bad"}]}`: AssertionError: eight fallback seeds survive into the stored table: expected [ { id: 'bad' } ] to have a length of 8 but got 1
- `runner/test/b5-incorporation.test.ts` — `b5-document-cannot-teach-schema / b5-explicit-column-replaces-fourth: trusted request reports its actual completed change`: AssertionError: expected [ 'company', 'salary', …(2) ] to deeply equal [ 'company', 'salary', …(2) ]
- `runner/test/b5-incorporation.test.ts` — `b5-unused-baselines-removed: no handed-off B5b production allowance remains`: AssertionError: expected [ …(3) ] to deeply equal []
- `runner/test/b5-incorporation.test.ts` — `b5-unknown-files-and-two-proposals: payload identity deduplicates different question ids`: AssertionError: expected [ 'lease', 'lease', 'permit' ] to deeply equal [ 'lease', 'permit' ]
- `runner/test/b5-incorporation.test.ts` — `b5-proposal-yes-no-ignore-replay: a later run deduplicates an ignored payload with a different id`: AssertionError: expected [ …(2) ] to deeply equal [ { id: 'q-proposal-lease', …(5) } ]
- `runner/test/model-input-fingerprint.test.ts` — `model input fingerprint the model input on the C04 fixture equals its golden copy`: AssertionError: expected 'Select context first. Return only {"i…' to be 'Select context first. Return only {"i…' // Object.is equality
- `runner/test/model-input-fingerprint.test.ts` — `model input fingerprint the raw model input on the C04 fixture equals its golden copy`: AssertionError: expected 'Select context first. Return only {"i…' to be 'Select context first. Return only {"i…' // Object.is equality
- `runner/test/type-table.test.ts` — `type-row contracts through the declaration parser B5a contracts: b5-row-schema-and-order`: AssertionError: type-table must export firstMatchingRow: expected undefined to be type of 'function'

## Implementation 2 (addendum 6)

implementer: codex

Attempt 4 continues committed typed-fact work at `c98c686a`. Status: **blocked for closure**,
with the newly allocated Table read/projection, runner-JSON grounding, proposal admission,
installation/decline and trusted column execution implemented. The remaining B4a work and
other failing assertions are below. No network, git write, dependency replacement, server,
manual e2e or pnpm check was run. The runner owns commits and check/capabilities/folder-table
on demo and fake. Designer verification remains outstanding.

### Scope, reuse and behavior

- `DriveVault.typeTable()` exposes declarations through its existing `json()` runner-file
  reader and versioned `readTextOnce()` cache. That reader delegates the table to the shared
  lenient parser. Missing/unreadable declarations fall back in Table. Other runner-file
  reads keep their existing validation/errors. The optional source method preserves old
  demo sources and source fixtures; fake/live DriveVault implementations inherit it.
- FolderScreen keeps the existing table, links, Status pill, header controls and sideways
  scroll. Only notes vote; the largest non-generic type wins, with stored row order breaking
  ties. Other types leave declared cells empty. Missing/unmatched/generic declarations use
  four nontechnical keys. Money/numbers format and align right; dates use `timelineDay`,
  lists reuse the scalar-list parser, typed sorting uses amount/date, and empties stay last
  both ways. Notes and their nonprojected properties are unchanged.
- Moved `insertTypeRow` and `requestTableColumn` into the existing shared note-format home,
  once, so the shared planner never imports runner code. New rows still use the strict
  validator; an existing row's column change uses the stored-read validation mode and
  retains extensions. The original runner reader export remains; helper tests target their
  shared public home. Projection and column requests also retain the kind/folder exclusions.
- Capture reads immutable proposals through the existing listing/index/read cache. Duplicate
  artifact paths and invalid envelopes grant no installation. Canonical frozen payload
  identity deduplicates across ids, current questions and earlier artifacts. New proposals
  enter in the existing askAfter order, capped at two new payloads and five open cards.
- New immutable `.bower/proposals/<id>.json` files are existing runner-JSON create effects;
  their closed `v/id/payload` envelope agrees with the authoritative question. Grounding
  permits proposals and type-table creates additively in its existing runner-file branch,
  sharing `proposalOk`, with no second grounding mechanism or writer.
- Question publication waits for artifact creates and source filing. Boolean yes must match
  the authoritative question and its frozen artifact, installs the exact strict payload
  before generic fallbacks, and the question/answer archive waits for the table write.
  Boolean no installs nothing; its archived answer and immutable payload suppress returns.
  Ignored proposals stay open, with no inbox-round history. Evidence and acceptance remain
  in the existing admitted capture, durable manifest, authoritative question and archived
  answer; no consent/decline store or maintain write was added.
- Explicit journal words of the form `Show <declared property> in the <type> table.` bind
  exactly one stored row id/match and property, then call `requestTableColumn`. This narrow
  proven syntax is the implemented v1 limit; unrelated wording is not claimed as completed.
  These requests bypass note-title settlement, so a type name cannot accidentally edit a
  similarly named personal note. Documents cannot execute the request. Request completion,
  publication and archival depend on the table effect. Today's report keeps raw request
  words; today's `runDetail` formats the truthful `"<request>" done` line.
- The existing engine supplies the content/version fence; no engine or manifest bypass was
  added. A real-main race changes the table after manifest persistence: its bytes survive,
  the column request remains pending, and the report contains no completed requests.

Research: reused the packet's local JSON Schema closed-object, ISO 4217, ISO 8601, RFC 9413
and Zod citations listed above; none fetched or independently reverified. No dependency,
new loader, new effect kind, private-field access/cast or schema-consent channel was added.

removed: runner/src/type-table.ts: insertTypeRow/requestTableColumn implementations moved once to shared note-format.
removed: harness/unused-production-baseline.json: insertTypeRow and requestTableColumn findings and their reasons.
removed: harness/unused-production-baseline.json: tableProperties finding after wiring FolderScreen.
removed: firstMatchingRow, propertyValuesOk and whole-file allowances: already removed before this attempt; none restored.
removed: harness/unused-baseline.json: none; the unrelated known finding is unchanged.

tests changed: runner/test/type-table.test.ts: retarget retired firstMatchingRow assertions to ordered readTypeTable output; route relocated helpers to their shared public exports; preserve all ids, order, strict-write and boundary assertions.

tests changed: runner/test/b5-incorporation.test.ts: use the existing two-step phaseAwareClaude helper with a raw execution envelope, assert exactly two context calls, and add garden evidence to the existing fixture so its named hub is a visible candidate; do not loosen selection ids or wants bounds.

tests changed: runner/test/b5-incorporation.test.ts: add six real-main cases for declined payload under another id, text/option nonconsent, a concurrent table change, byte-preserved extension reads and a lenient rewrite; all original assertions are retained.

tests changed: runner/test/fixtures/model-input-c04.golden.txt: regenerate only inherited table-related prompt bytes; JSON context and fingerprint controls are unchanged; byte diff below.

tests changed: runner/test/fixtures/model-input-c04.raw.golden.txt: the same table-only regeneration; raw ids, fences, context and byte-equality assertions are unchanged; byte diff below.

tests changed: src/data/vault/note-format.test.ts: add a projection control retaining stored kind/folder properties while excluding their columns, and quoted/unquoted scalar-list controls; no existing assertion changed.

No other existing test changed. In particular, architecture.test.ts, questions.ts/tests,
model-input-fingerprint.test.ts, answer-loop.ts/tests and folder-table.spec.ts are unchanged.
No only/skip, assertion/bound weakening, corpus driver change or test-generated repo file.

### C04 byte diff (TL-P4-47 addendum 6)

Both captures came from the actual provider/main with the existing C04 fixture, in an OS-temp
copy of the golden tests. Tests wrote only `/tmp/b5b-c04-normalized.txt` and
`/tmp/b5b-c04-raw.txt`; the implementation session copied those bytes into the goldens after
review. The exact equality assertions and identical-runs/fresh-ids controls are unchanged.

- Normalized: **11,504 -> 11,720 UTF-8 bytes**, **+216**.
- Raw: **11,607 -> 11,823 UTF-8 bytes**, **+216**.
- Replaced the old ten-line fixed document-kind list with the already committed three-line
  declaration-precedence/closest-kind instructions, retaining the payslip example.
- Inserted eleven lines before the identical JSON context: the already committed
  `Use the first matching row...` instruction, two Markdown header lines and all eight seed
  rows in their original order. No JSON-context field/value/id/version changed.
- Exact unified byte/text diffs: `/tmp/b5b-c04-normalized.diff` and `/tmp/b5b-c04-raw.diff`.
  The full fingerprint suite now passes, including both golden checks and identical runs.

### Waiting for B4a

`src/data/contracts/run-manifest.ts` is untouched, as explicitly instructed. No fake SeenFile,
alternate type-table create, weakened strict validator or direct pre-manifest write was added.

1. `runner/test/b5-incorporation.test.ts:172-173`, missing-table parameter of
   `b5-table-first-create-and-lenient-read`: both eight stored seeds and the ruled
   write-runner-json create remain red. The current effect requires an existing before and
   beforeContent. Missing-file installation/column writes remain pending until that contract
   and its existing consumers acquire expected absence. Empty/all-invalid **existing** tables
   now normalize to the eight seeds through the existing fenced effect and pass.
2. `runner/test/b5-incorporation.test.ts`, `a trusted rewrite retains stored extension keys` (assertion at line 370):
   remains red at `result.code === 0`. Shared helpers retain envelope/row/property extensions,
   but the current manifest guard validates the entire rewritten table as a strict new table.
   The strict-new/lenient-rewrite split must arrive after B4a. Unchanged stored extension bytes,
   including negative/fractional unknown values, remain readable and byte-identical.
3. `src/architecture.test.ts:154,166`: both literal-based impurity assertions remain red for
   the already committed `identity-document` seed. The B4a literal-ignoring gate fix arrives
   by later merge. No seed obfuscation or architecture-test change was made.

### Contradictions and other gate failures

The full runner and src sweeps were run, not stopped at the first failure.

- `runner/test/b5-incorporation.test.ts:191`, trusted-column report assertion, expects the
  formatted `"Show hours in the offer table." done` sentence inside last-run JSON. The
  accepted report stores raw `report.requests` and `runDetail` produces that sentence in
  the UI (`src/features/tidy/run-words.ts:133`). Actual main output has the changed fourth
  column and exactly `requests: ["Show hours in the offer table."]`. Adding a UI sentence to
  that wire would change the contract or duplicate the existing formatter. This assertion
  stays red pending a lead red-repair ruling; its column assertion now passes.
- Added text/option nonconsent cases in `runner/test/b5-incorporation.test.ts:323`: no row is
  installed, no artifact is edited, and the planner leaves the answer pending, but the final
  authoritative question list loses the card. `answeredAskings` in
  `src/data/contracts/questions.ts:103-105` accepts any QuestionAnswer, and existing closing
  consumers treat raw nonboolean proposal answers as settled. The shared questions contract
  is not allocated to this attempt. No local alternate consent/closing rule was added.
  The public `checkedAnswer` and answer-loop tests already reject these values; these reds
  exercise malformed/directly stored journals through real main. The lead must allocate the
  root closing rule; these newly exposed assertions are not weakened or removed.
- `src/docs.test.ts:134`: existing accepted compatibility ledger still lacks `aa54844f` and
  `c98c686a`. The shared ledger is unowned; draft rows for this attempt are below.
- `src/e2e-port.test.ts:37`: expected sandbox EPERM on its local listen, a 5000 ms timeout, plus one unhandled
  error. No test or port workaround was made.
- The shared planner consumes the existing `Decisions.askAfter` seam. The handed-off Claude
  Filing/modelDecisions transport still has no novel-type proposal payload field. Automatic
  Claude proposal generation and multiple proposal candidates within one pile need a lead
  transport ruling/allocation; this attempt does not invent a provider protocol. The real-main
  lifecycle tests inject decisions at the existing provider seam, not a substitute writer.

### Compatibility draft

Each changed contract/feature home has a draft row for the coordinator's accepted ledger.

| Changed home | Contract change | Existing stored data / callers | Evidence |
| --- | --- | --- | --- |
| src/data/contracts/note-format.ts: insertTypeRow/requestTableColumn | Move the existing implementations into the shared core; strict new rows, lenient existing row edits | Runner reader re-export retained; no production helper caller lost; existing extensions survive shared edits, pending manifest rewrite ruling | full type-table suite; exact-yes install and trusted-column main cases |
| src/data/contracts/note-format.ts: tableProperties/scalarList | Exclude existing kind/folder keys from projection; export and reuse the one list parser | No stored property, scalar serialization or note ownership change; quoted and legacy unquoted lists retain the same parsing | added projection/list test; all note-format and B6a suites; OS-temp real screen checks |
| src/features/files/FolderScreen.tsx: FolderTable | Consume optional declarations; majority/order projection, typed display/sort and empty-last | Old sources without declarations keep four-key fallback; Name/Status/Changed, links, sideways scroll and nonprojected note properties remain | OS-temp real DriveVault/FolderScreen 4/4; existing 52 browser states await runner/designer |

### Verification and call counts

All command output, configs, caches, JSON reports and self-checks are in OS temp. The temp
configs keep the timer guard and original test includes, omit only repository CPU reports,
and redirect Vite caches and Vitest JSON outside the repository. No repository test config,
dependency directory, timer rule or runner driver was changed.

Commands and final results are recorded below after completion. pnpm check and e2e remain
runner-owned, not claimed green. The completed first full sweep had runner 740/742 passing
and src 5776/5780 passing; later additive adversarial/extension tests and list projection
changes justify the final full sweep rather than another narrow-only run.

Named call/count observations (real-main mock-clock cases, final authoritative operations):
- Two new proposals with no earlier cards: read stage **17 calls**, apply **36**; before this
  attempt the missing-artifact implementation read **17**, applied **28**. The eight extra
  apply calls are the proposal-folder/two immutable creates and their existing confirmations;
  no new model or maintain write was added. Questions publish after these artifacts.
- Exact yes installation: read **17**, apply **24**, against earlier **16/21** without the
  frozen-artifact lookup/table effect. Redispatch keeps the same artifact bytes and one row.
- Table declaration read: OS-temp real DriveVault control proves **one readText call** for
  two typeTable reads at the same version. Per Table mount this is one additional runner-file
  read alongside the existing note reads; the existing source cache owns invalidation.
- Payload/legacy decline lookup reuses capture's listing and shared cache. It reads prior
  immutable artifacts and, only with new proposal candidates, archived answers; no new list
  call or duplicate loader. History growth is not a measured production timing acceptance.
- All new main cases use the existing fake clock (timing total=0); no wall-clock timing-growth
  claim is made. Designer verification, 375/1440 browser/axe and real-load timings are left to
  the runner/evaluator and lead. No threshold was loosened or passed without measurement.

Final commands/results:

| Check | Result | OS-temp log |
| --- | --- | --- |
| Full runner, `--maxWorkers=2` | 743 pass / 5 fail, 58 files; failures all listed above | /tmp/b5b-attempt4-runner-final.log |
| Full `vitest run src --maxWorkers=2` | 5777 pass / 4 fail, 172 files; EPERM also emits one error | /tmp/b5b-attempt4-src-final.log |
| App TypeScript, no emit/incremental | pass | /tmp/b5b-attempt4-app-types.log |
| Node TypeScript, no emit/incremental | pass | /tmp/b5b-attempt4-node-types.log |
| Runner TypeScript, no emit | pass | /tmp/b5b-attempt4-runner-types.log |
| Touched app/contract/test ESLint | pass | /tmp/b5b-attempt4-app-lint.log |
| Touched runner/test ESLint | pass | /tmp/b5b-attempt4-runner-lint.log |
| check-unused-gate.mjs | pass; 1 unchanged general finding, 25 unchanged production findings | /tmp/b5b-attempt4-unused.log |
| OS-temp real source/screen self-checks | 4/4 pass: values/sort, tie/empty cells, one versioned declaration read, four-key fallback | /tmp/b5b-attempt4-screen.log |
| git diff --check (read-only) | pass | command output empty |

Exact suite commands:

```sh
pnpm exec vitest run --config /private/tmp/b5-runner.config.mts --configLoader runner --maxWorkers=2 > /tmp/b5b-attempt4-runner-final.log 2>&1
pnpm exec vitest run src --maxWorkers=2 --config /private/tmp/b5-app.config.mts --configLoader runner > /tmp/b5b-attempt4-src-final.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false > /tmp/b5b-attempt4-app-types.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit --incremental false > /tmp/b5b-attempt4-node-types.log 2>&1
pnpm exec tsc -p runner/tsconfig.json --noEmit > /tmp/b5b-attempt4-runner-types.log 2>&1
node scripts/check-unused-gate.mjs > /tmp/b5b-attempt4-unused.log 2>&1
```

ESLint commands used the installed parser with explicit tsconfigRootDir per package as in
previous attempts; no config change. The only later runner test edit is a type-only
LastRunFile assertion narrowing, confirmed by runner tsc and lint; all runtime assertions
are identical to the final full sweep. `.codex-commits.json` contains exactly three groups:
production, test sweep, notes alone. The runner commits those groups; this session wrote
no commit or workspace git metadata. Full-suite method fixtures use only OS-temp repos.

## Implementation 3 (B4a integrated)

implementer: codex

Attempt 5, after the B4a and claude/p3 integration. The missing-table and extension-rewrite
blockers are implemented; closure still waits for the lead's outstanding assertions and
the runner's check/e2e. No network, direct git write, node_modules replacement/symlink,
manual server, pnpm check or manual e2e. `.codex-commits.json` describes production,
test sweep and notes-only commits for the runner.

### Scope and reuse

- The existing write-runner-json effect gains an explicit expected-absence form for the
  type table: null before/beforeContent, its captured parent and the usual create key.
  No invented SeenFile, effect kind, writer, pre-manifest write or maintenance write.
  Admission requires the resolved .bower parent and no captured table at that path;
  outsideAdmitted also requires that exact admitted system-folder id.
- Planning persists the eight seeds on first creation, and permits a frozen-payload yes
  to install its exact row when the table is absent. Existing unreadable tables still
  prohibit writes. Existing empty/all-invalid tables keep the same fenced normalization.
- The engine translates that absence form into its existing runner-file create handling
  only while executing it. The durable manifest retains write-runner-json. The opening
  reserves its id; scheduling claims the destination folder exclusively; existing checks,
  fences, stamped sends, answer-byte validation and reserved-id reconciliation all apply.
  The table's create key uses the existing runKeys with its own table namespace, so repeated
  builds and resumed fake runs retain the same ids/bytes without advancing another create's
  injected key sequence.
  An arriving table is kept byte-for-byte with no duplicate. A lost create reply recovers
  the reserved file exactly once with the planned bytes.
- typeTableOk stays strict by default. Manifest admission opts into stored-row validation
  only for an existing-file rewrite, preserving envelope, row, property and grouping
  extension keys. Duplicate ids, invalid known declarations and undeclared columns still
  refuse. New tables and proposal payloads retain strict closed-object checks.
- Existing consumers receive only the necessary null-before guards: the grounded/report
  file-id filters, the runner hot projection and test read-id/hash helpers. The one-line
  runner/src/index.ts guard is required by the additive effect union; it adds no provider,
  model-input or maintenance behavior. B4a's validLearnedBlock and maintenanceTargetOk are
  untouched; the ledger's prior-id comparison only gains a null guard for the union.
- No files under src/features changed in this attempt. The previously landed Table
  projection, source read, proposal planning, bounds and prompt/golden sweep are retained.

Research: reused the packet's local closed-JSON-object and RFC 9413 citations, existing
reserved-id/write-ahead engine and declaration reader. No citations fetched or independently
reverified; no dependency added.

removed: src/data/contracts/run-manifest.ts: existing-file-only restriction for the ruled type-table effect.
removed: src/data/spine/scripted.ts: existing-table prerequisite for first creation and frozen-payload installation.
removed: baselines/helpers: none; the earlier handed-off B5b removals remain removed.

tests changed: runner/test/b5-incorporation.test.ts: add missing-table exact-yes parameter and arriving-table race; keep every existing bytes/ids/column/report/consent assertion.
tests changed: runner/test/type-table.test.ts: expose the optional stored-validation argument in the test signature; add strict-new/stored-extension and malformed-known-field controls; preserve all existing bounds.
tests changed: src/data/spine/engine.test.ts: add lost-reply table-create reserved-id, exact bytes and single-send controls; null-safe the existing rewrite-id lookup without changing its conflict assertion.
tests changed: src/data/fake/fake-worker.test.ts: null-safe only before-id and beforeContent-hash lookups for the additive effect union; every expected digest, byte snapshot, id and count is unchanged.
tests changed: src/data/fake/fake-worker.test.ts: bind the rejected-hashes lookup to SYSTEM.hashes instead of the first runner write; add the ruled table effect to the exact exhaustive effect list; rejection, hash equality and existing effects are unchanged.
tests changed: runner/test/recovery.test.ts: omit an absent before-image from readIds; existing reserved-id recovery and all assertions stay unchanged.

### Resolved after B4a

- b5-table-first-create-and-lenient-read: missing, empty and all-invalid tables now store
  eight seeds through write-runner-json; unreadable/valid-table controls still pass.
- a trusted rewrite retains stored extension keys now passes through production main.
- src/architecture.test.ts passes all nine tests, including the integrated literal/global
  controls. This attempt makes no architecture-test edit.
- The added first-create collision, missing-table exact-yes/replay and lost-reply recovery
  controls pass. Strict-new/stored-rewrite validation controls pass.

### Waiting for the lead

Every final runner failure is listed here; no assertion or limit was weakened.

1. runner/test/b5-incorporation.test.ts:210 (original :191): the trusted-column report
   assertion still expects the formatted sentence inside last-run JSON. The exact assertion
   is unchanged. Raw report.requests remains the wire contract and runDetail owns the
   formatted done line. The actual fourth-column change succeeds.
2. runner/test/b5-incorporation.test.ts:341, both nonboolean consent parameters, remains
   red: neither installs a row or edits the artifact, and the journal answer stays pending,
   but the existing shared closing rule drops the authoritative question. The questions
   contract and its closing-rule allocation still need the lead's ruling.
3. runner/test/drive-calls-golden.test.ts:27: C04 first creation sends 99 calls against
   the unchanged exact 96-call pin.
4. runner/test/drive-calls-golden.test.ts:53: the same 99 calls exceeds the unchanged
   cold ceiling of 96. This bound is not loosened.
5. runner/test/drive-calls-golden.test.ts:86: C04 again sends 99 against 96; the measured
   25-earlier-run control sends 110, with later assertions not reached after the first failure.
6. runner/test/timing-counts.test.ts:15: phase totals sum to 99 against the unchanged 96.

The three-call creation delta uses the existing destination listing, parent fence and
multipart create. C04's final named counts: reads 25, apply 58, checkpoints 4, report 10,
runner 2. No new listing/reader during declaration capture, model call or maintenance
effect. Thresholds/goldens outside this packet are unchanged and require the lead's ruling.
The existing novel-type Claude transport allocation, accepted compatibility-ledger entries,
designer verification and runner-owned check/e2e remain outstanding as previously recorded.

Final src gate failures: src/docs.test.ts:134 still lacks compatibility rows for f45f2ca4,
c98c686a and aa54844f; src/e2e-port.test.ts:37 has the expected sandbox EPERM timeout
and one associated unhandled listen error. Both are unchanged; no workaround was added.
The first complete src sweep exposed these four additional assertions, now resolved with all 243 focused tests
passing in /tmp/b5b-attempt5-src-fix-controls.log:

- src/data/spine/recovery.test.ts:133: random default table-create key changed manifest,
  report hashes and table stamps between independent runs. The existing runKeys now supplies
  that new create's stable key. Exact full-state/byte/hash equality is unchanged and passes.
- src/data/spine/scripted.test.ts:273: table creation advanced a shared injected generator
  on a second build. The same stable type-table key fixes it; exact manifest equality is
  unchanged and passes. Neither recovery nor scripted test was edited.
- runner/test/claude-provider.test.ts:777: the first stable namespace, type-table, included
  a hyphen where the existing exact key-format assertion permits letters only. Production
  now uses table, preserving that assertion and the run-derived key prefix unchanged.
- src/data/fake/fake-worker.test.ts:1354: the hashes fixture selected the new table effect
  by the first generic write kind. Its lookup now names SYSTEM.hashes, keeping the exact
  rejected outcome and all recomputed hashes assertions.
- src/data/fake/fake-worker.test.ts:5530: the exhaustive effect list omitted the newly ruled
  write-runner-json type-table effect. It is added without removing any existing effect.

### Compatibility draft

One draft row per changed contract home; no feature home changed in this attempt.

| Changed home | Contract change | Existing stored data / callers | Evidence |
| --- | --- | --- | --- |
| src/data/contracts/run-manifest.ts: effect/admission | Add explicit expected-absence type-table write | Historical existing-file effect shape and identities remain accepted; creates keep strict tables, captured system-folder identity, reserved ids and collision fences; B4a memory validators unchanged | missing/empty/all-invalid main cases; arriving-table and lost-reply controls; full manifest and B4a suites |
| src/data/contracts/run-manifest.ts: planningArtifactsOk | Use stored validation only for an existing-file rewrite | New tables stay strict; historical extension-bearing declarations can be rewritten through the existing version/content fence | trusted-extension main case; strict-new/stored-validation controls; existing concurrent-rewrite case |
| src/data/contracts/note-format.ts | Optional stored mode on typeTableOk, strict by default | Existing one-argument callers keep strict writes; trusted rewrites preserve unknown keys without accepting invalid known fields or duplicate ids | full type-table suite; strict-new/stored-validation controls; trusted-extension main case |

### Verification

Final checks:

| Check | Result | OS-temp log |
| --- | --- | --- |
| Full runner, --maxWorkers=2 | 747 pass / 7 fail, 59 files; all failures listed under Waiting for the lead | /tmp/b5b-attempt5-runner-final.log |
| Full vitest run src, --maxWorkers=2 | 5827 pass / 2 fail, 180 files; compatibility ledger and expected EPERM only | /tmp/b5b-attempt5-src-final.log |
| Final table-key engine/recovery/scripted controls | 66/66 pass after the final namespace-only adjustment | /tmp/b5b-attempt5-table-key-controls.log |
| App TypeScript, no emit/incremental | pass | /tmp/b5b-attempt5-tsc-app-final.log |
| Node TypeScript, no emit/incremental | pass | /tmp/b5b-attempt5-tsc-node-final.log |
| Runner TypeScript, no emit | pass | /tmp/b5b-attempt5-tsc-runner-final.log |
| Touched app/contract/test ESLint | pass | /tmp/b5b-attempt5-eslint-app.log |
| Touched runner/test ESLint | pass | /tmp/b5b-attempt5-eslint-runner.log |
| node scripts/check-unused-gate.mjs | pass; 2 existing general / 29 existing production findings | /tmp/b5b-attempt5-unused.log |
| git diff --check, read-only | pass | empty command output |

Exact full-suite commands:

```sh
pnpm exec vitest run --config /tmp/b5b-attempt5-runner.config.mts --configLoader runner --maxWorkers=2 > /tmp/b5b-attempt5-runner-final.log 2>&1
pnpm exec vitest run src --maxWorkers=2 --config /tmp/b5b-attempt5-app.config.mts --configLoader runner > /tmp/b5b-attempt5-src-final.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false > /tmp/b5b-attempt5-tsc-app-final.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit --incremental false > /tmp/b5b-attempt5-tsc-node-final.log 2>&1
pnpm exec tsc -p runner/tsconfig.json --noEmit > /tmp/b5b-attempt5-tsc-runner-final.log 2>&1
node scripts/check-unused-gate.mjs > /tmp/b5b-attempt5-unused.log 2>&1
```

The complete src sweep passes all B4a, manifest, B6a, bounds and architecture tests. Its
last create-key namespace change was checked afterward by the exact engine/recovery/
scripted equality controls and the full runner suite. The unchanged modelled apply-time
bound passes at 6530 ms against 8025 ms; whole-run 20% assertions in the retention golden
are not reached after the exact-count failure, so no whole-run timing acceptance is claimed.
The same tests, files, bounds, hashes and id-format assertions remain in the final tree.

The initial direct Vitest commands used the default timer setup, which also wrote CPU
reports into the checkout. Those full sweeps were stopped and 5 app / 31 runner reports
created by this attempt were moved to /tmp/b5b-attempt5-accidental-cpu/. They changed no
tracked file. Final suites use OS-temp configs/caches/JSON and a copied setup retaining
the exact createTimerGate/fullName/allowed-tests check, with only CPU reporting omitted.
The first temp app config omitted Vite's OS-temp allow-list and failed to load the setup;
the final app run corrects that test-launch config only. Neither failure was treated as an
app regression. No repository config, timer guard or dependency directory was replaced.

Touched-file ESLint uses the installed config/parser with explicit package tsconfigRootDir
in an OS-temp launcher, as in attempt 4. The initial combined CLI had the same ambiguous
root-parser error; the final app/runner lint commands pass without repository config edits.

Left out / risk: deferred manifest creation/rewrites and architecture merge, shared raw-answer
closing rule, and the unresolved Claude novel-type transport; existing public API rejects raw
nonboolean consent, but malformed stored answers can hide cards. No check/e2e/designer or
production timing acceptance is claimed. Closure needs the lead's rulings and the runner gates.


## Rulings (addenda 7 and 8)

Attempt 6 implements the addendum 7 report-layer repair and addendum 8 proposal-text
continuation in the existing homes. The named first-create rise is applied. Delivery is
**blocked by the new existing-table control**, not by the already-ruled creating-run pins.
No network, git write, node_modules replacement or symlink was used. The runner owns
commits, pnpm check and capabilities/folder-table e2e on demo and fake.

### Scope and implementation

- `checkedAnswer` is the shared backend boundary used by DriveVault, demo, answerQuestion
  and the Claude answer reader. It accepts bounded proposal text using the existing
  isQuestionAnswer validation; options remain refused because proposals have no options.
- `answerRun` starts the existing instructions continuation for proposal text. Boolean
  yes retains its exact frozen-payload consent; false still starts no run. No new run,
  journal format, consent path, reader, writer or loop was added.
- The Claude answer projection retains the question's proposal so `subjectOf` sees its
  real subject. Its text reaches both selection and execution inputs under `answers`,
  with the exact question and person's words; it cannot become a boolean yes.
- The planner uses the full stored question with `subjectOf`, rather than an id-only
  projection that loses proposal identity. Text settles through proposalSettled and the
  existing answeredAskings/questions write/archive dependencies. The question closes,
  neither table nor frozen payload changes, and the answer's archive retains exact bytes.
- Proposal subjects have no inbox member (the stored contract prohibits subject/words).
  Their continuation is instructions-scope, as for proposal yes. Inbox text retains its
  member provenance check and the existing two-round bound, exercised by all 43
  q1-continuation tests in the full runner suite; no fabricated proposal-to-item link or
  second round counter was introduced.
- The report continues storing raw requests. `runDetail` alone formats the done sentence.
  The new UI words test asserts `"Show hours in the offer table." done.` exactly.

Research: reused the packet's locally cited closed-object validation
(https://json-schema.org/understanding-json-schema/reference/object#additionalproperties)
and the existing answer loop's idempotency-key design
(https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).
No source was independently reverified because network access was prohibited.

removed: the assumption that all nonboolean proposal answers are invalid consent; text is person words, never installation consent.
removed: the id-only proposal projection in answer transport and settlement; both reuse subjectOf with the stored question.
removed: no production helper, dependency, byte/id/fence assertion or timing/round bound.

tests changed: runner/test/drive-calls-golden.test.ts: exact C04 total 96 -> 99, named rise "first creation of the type table: listing, fence, create".
tests changed: runner/test/drive-calls-golden.test.ts: timing's exact C04 total 96 -> 99 and apply 55 -> 58, named rise "first creation of the type table: listing, fence, create".
tests changed: runner/test/drive-calls-golden.test.ts: cold ceiling 96 -> 99 via the named +3 constant, "first creation of the type table: listing, fence, create"; prior arithmetic/cut kept.
tests changed: runner/test/drive-calls-golden.test.ts: retention control C04 96 -> 99, retained run 107 -> 110 and retained apply 54 -> 57, named rise "first creation of the type table: listing, fence, create" in both creating runs; timing bounds unchanged.
tests changed: runner/test/drive-calls-golden.test.ts: add an existing-table control pinning raw calls and timing at 96, with the former phases; this control remains red at 97.
tests changed: runner/test/timing-counts.test.ts: sum 96 -> 99 and apply 55 -> 58, named rise "first creation of the type table: listing, fence, create"; byte-consistency assertion unchanged.
tests changed: runner/test/b5-incorporation.test.ts: addendum 7 replaces sentence matching in serialized last-run JSON with exact report.requests equality to the raw request; production formatting unchanged.
tests changed: runner/test/b5-incorporation.test.ts: replace the nonboolean text/option parameterization with an answerQuestion-to-main text continuation test; assert closed question, no installation, exact table/payload bytes and both trusted answer inputs. The formerly pending invalid answer now settles, so its bytes are asserted exactly in the existing archive. Option refusal is covered at the shared backend boundary in answer-loop.test.ts.
tests changed: src/data/answer-loop.test.ts: replace text rejection with one instructions continuation assertion; retain string/option rejection and add the original option "yes" refusal before any record/run.
tests changed: src/features/tidy/run-words.test.ts: add exact runDetail rendering of the ruled table request; keep the general request rendering controls unchanged.

### Waiting for the lead: new 96-call control contradiction

Full runner suite: 753 pass / 1 fail, 59 files. Every contradiction is listed here:

- `runner/test/drive-calls-golden.test.ts:49`, **an existing type table keeps the 96-call pin**:
  actual raw Drive calls are 97, against the ruled 96. Timing also totals 97 (the assertion
  at :50 is after the first failure); phases are reads 26, apply 55, checkpoints 4,
  report 10, runner 2, with token/model/status 0. The phase pin at :51 expects reads 25.
  The valid existing table necessarily has a media read in `capture`
  (`src/data/spine/scripted.ts`, existing typeText/ownText path). In the creating run,
  the table is absent and that read is absent: reads 25 plus apply 58 gives 99.
  This is a +1 existing-table read, separate from the authorized three-call first create.
  No pin was raised to 97, read/fence omitted or timing assertion loosened. A further
  lead ruling or an allocated real call reduction is required; fixture manipulation or
  prewarming outside the measured run would conceal the discrepancy.

The creating-run exact totals, cold ceiling, retained 110-call control and all time bounds
pass. All 30 b5-incorporation tests, including text continuation, pass. All 43 Q1 continuation
controls pass, including subject provenance, unrelated-pile exclusion and exhaustion at two.

### Compatibility draft

| Changed home | Contract change | Existing callers/stored data | Evidence |
| --- | --- | --- | --- |
| src/data/contracts/questions.ts: checkedAnswer | Accept proposal text under existing answer bounds; options still refused | Legacy yes/no and inbox text/options unchanged; no stored shape changes | answer-loop tests; all Q1 continuation controls |
| src/data/answer-loop.ts: answerRun | Proposal text starts instructions continuation with the existing asking idempotency key | Boolean yes/no behavior and inbox subject scope unchanged | answer-loop and main text continuation tests |
| runner/src/claude.ts: answer projection | Retain proposal subject internally so its person text reaches existing answer inputs | No public/model wire field added; unrelated inbox text still excluded | main text continuation; Q1 provenance controls |
| src/data/spine/scripted.ts: proposal settlement | Use stored question subject; text settles without installation | Frozen yes verification and question/archive fences unchanged; answer bytes preserved | full b5-incorporation and runner suites |

### Verification

Red: `/tmp/b5b-a6-red-assertion.log`, **person text starts the existing instructions
continuation without granting consent**: `.resolves.toMatchObject` fails because the
shared boundary rejects the answer. `/tmp/b5b-a6-red-runner.log` also reproduces the
same refusal through the integration test. The later diagnostics exposed missing
proposal identity and settlement; those paths are now green.

| Check | Result | OS-temp log |
| --- | --- | --- |
| Full runner, --maxWorkers=2 | 753 pass / 1 fail; new ruled existing-table pin only | /tmp/b5b-a6-runner-final.log |
| Full vitest run src, --maxWorkers=2 | 5829 pass / 2 fail; coordinator ledger and expected sandbox EPERM only | /tmp/b5b-a6-src-final.log |
| App TypeScript, no emit/incremental | pass | /tmp/b5b-a6-tsc-app-final.log |
| Node TypeScript, no emit/incremental | pass | /tmp/b5b-a6-tsc-node-final.log |
| Runner TypeScript, no emit | pass | /tmp/b5b-a6-tsc-runner-final.log |
| Touched app/contract/test ESLint | pass | /tmp/b5b-a6-eslint-app-final.log |
| Touched runner/test ESLint | pass | /tmp/b5b-a6-eslint-runner.log |
| node scripts/check-unused-gate.mjs | pass; 2 existing general / 29 existing production findings | /tmp/b5b-a6-unused.log |
| git diff --check, read-only | pass | empty command output |

An initial combined root/runner ESLint invocation could not infer one tsconfig root;
separate invocations in each existing config's directory pass, without config edits.
Temporary Vitest configs retain the existing app/runner settings and timer gate but put
cache, JSON results and logs in OS temp. The timer setup omits only the optional CPU
report that otherwise writes test-results inside the checkout. No tests wrote repo artifacts.
The final verification commands are:

```sh
pnpm exec vitest run --config /tmp/b5b-a6-runner.config.mts --configLoader runner --maxWorkers=2 > /tmp/b5b-a6-runner-final.log 2>&1
pnpm exec vitest run src --config /tmp/b5b-a6-app.config.mts --configLoader runner --maxWorkers=2 > /tmp/b5b-a6-src-final.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false > /tmp/b5b-a6-tsc-app-final.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit --incremental false > /tmp/b5b-a6-tsc-node-final.log 2>&1
pnpm exec tsc -p runner/tsconfig.json --noEmit > /tmp/b5b-a6-tsc-runner-final.log 2>&1
pnpm exec eslint src/data/answer-loop.ts src/data/answer-loop.test.ts src/data/contracts/questions.ts src/data/spine/scripted.ts src/features/tidy/run-words.test.ts > /tmp/b5b-a6-eslint-app-final.log 2>&1
# From runner/:
pnpm exec eslint src/claude.ts test/b5-incorporation.test.ts test/drive-calls-golden.test.ts test/timing-counts.test.ts > /tmp/b5b-a6-eslint-runner.log 2>&1
# From the worktree root:
node scripts/check-unused-gate.mjs > /tmp/b5b-a6-unused.log 2>&1
```

left out: pnpm check, commits and capabilities/folder-table e2e remain runner-owned;
compatibility rows remain coordinator-owned. No unrelated budget optimization was attempted.

Final src failures (complete list; no test edits):

- `src/docs.test.ts:134`: compatibility rows missing for 36b7058d, f45f2ca4,
  c98c686a and aa54844f; coordinator-owned per the assignment.
- `src/e2e-port.test.ts:37`: expected sandbox listen EPERM causes the 5000 ms
  test timeout and one associated unhandled listen error. No workaround added.

Final app/runner suites were followed only by explanatory comment changes and this
notes append; no runtime or assertion changed after those suites. `.codex-commits.json`
lists exactly three groups: production, tests and notes alone. No git commit was made.


## Pin repair (TL-P4-47 addendum 9)

Scope: test pins only, following addenda 8 and 9 and the last waiting-for-lead
contradiction. No production code, creating-run pins (99), cold creation ceiling,
retained 110-call control or time bounds changed. No remaining 96 pins in runner/test.

The existing-table control is named "reading the type table: one media read".
Its phases are reads 26, apply 55, checkpoints 4, report 10 and runner 2;
token, model and status remain 0, totaling 97. timing-counts previously covered only
creation, so its 99-call test is preserved and a separate existing-table control added.
Both controls reuse the existing valid-table fixture pattern and measured main run.

tests changed: runner/test/drive-calls-golden.test.ts: raw existing-table total 96 -> 97, named "reading the type table: one media read".
tests changed: runner/test/drive-calls-golden.test.ts: timing existing-table total 96 -> 97, named "reading the type table: one media read".
tests changed: runner/test/drive-calls-golden.test.ts: existing-table reads phase 25 -> 26, named "reading the type table: one media read"; other phases unchanged.
tests changed: runner/test/timing-counts.test.ts: added existing-table total 97 and reads 26 control, named "reading the type table: one media read"; creating total 99 unchanged.

Verification (all commands local; no network or git writes):

- Red: both targeted files, --maxWorkers=2: 7 passed / 1 failed;
  existing-table raw calls expected 96, received 97 at drive-calls-golden.test.ts:49.
  Log: /tmp/b5b-pin-red.log.
- Green: both targeted files, --maxWorkers=2: 9 passed, 2 files.
  Log: /tmp/b5b-pin-targeted.log; JSON: /tmp/b5b-pin-targeted.json.
- Full runner suite, --maxWorkers=2: 755 passed, 59 files, exit 0.
  Log: /tmp/b5b-pin-runner.log; JSON: /tmp/b5b-pin-runner.json.
- Runner tsc --noEmit -p .: exit 0; /tmp/b5b-pin-tsc.log.
- ESLint on both touched test files: exit 0; /tmp/b5b-pin-eslint.log.

Reporting mistake: the initial red command inherited Vitest's repository JSON output
(runner/test-results/unit.json, ignored). Later commands explicitly override outputFile.json
to OS temp. Console logs always went to OS temp. No test source or production change
was made for reporting; the generated red report was removed after verification.

Sources: local ruling docs/harness/DECISIONS.md, TL-P4-47 addenda 8 and 9;
existing golden and timing-counts tests, and the last waiting-for-lead section above.
No external citation independently checked under the no-network instruction.

Left out: pnpm check and capabilities/folder-table e2e belong to the runner after commits.
Risk: those deferred gates remain unverified here. The commit manifest separates tests
from this notes-only commit; no commits were made by this session.

## Round 1 reds (addendum 10)

Tests-only fix-round evidence for TL-P4-47 addendum 10 findings (1)–(3), reproduced in
`2026-10-11-b5b-adversarial-1.md`. One new file contains exactly three reds. Existing
tests, production code, fixtures, configs, bounds and the 99/97 call pins are unchanged.
No network, git command, commit, dependency replacement or symlink was used. All data
is made up; the runner owns the two commits listed in `.codex-commits.json`.

Scope: reuse the existing `providerFor` decisions seam, production `planScripted` and
`main`, admission, manifests and the in-memory Drive v3 transport. No parser, writer,
Source-role helper or store is replaced. The table read assertion uses the shared
`readTypeTable` called by capture; the same stored fixture also runs through real main.
Only the new test, this notes append and the runner's commit manifest were written.

Research: reused the packet's local bounded-tolerant-read precedent
https://www.rfc-editor.org/rfc/rfc9413.html and closed-write schema precedent
https://json-schema.org/understanding-json-schema/reference/object#additionalproperties.
These sources were not independently fetched or reverified under the no-network rule.

tests changed: runner/test/b5b-r2.test.ts: add "b5b-r2 1 source role by one helper"; create the offer Source, unclassified Source and Concept through main, then submit timeline lines through a second main run; include a legacy by: bower / type: source fixture.
tests changed: runner/test/b5b-r2.test.ts: add "b5b-r2 2 more than four columns"; five- and six-column stored rows must read their first four and retain original bytes through unrelated main runs; four-column row is the unchanged control.
tests changed: runner/test/b5b-r2.test.ts: add "b5b-r2 3 row-level splice"; trusted request changes column four through main while unchanged rows, unknown keys and surrounding bytes retain their exact stored text, including 9007199254740993.

### Final red results

Each named run used `--maxWorkers=2`, exited 1 with exactly one failing test, and failed
only on its named finding. The combined final file run has exactly three failing tests,
with no other tests or runtime/collection failures. Every hard positive-control assertion
passes before the finding's soft assertions; there are no `.skip` or `.only` declarations.
The two filtered-out tests in each named run are Vitest's ordinary name filtering.

| Exact name | Passing controls | Finding assertions | OS-temp log / JSON |
| --- | --- | --- | --- |
| `b5b-r2 1 source role by one helper` | Main creates type offer/source/concept; Concept gains the line; unclassified and legacy Sources retain exact bytes and refuse with unsupported | Offer Source gains a Timeline; only two unsupported refusals instead of three | `/tmp/b5b-r2-1.log`, `/tmp/b5b-r2-1.json` |
| `b5b-r2 2 more than four columns` | Each unrelated item files; four-column row reads unchanged and stays byte-identical | Five/six-column lease row is absent from the read and replaced by eight seeds in storage | `/tmp/b5b-r2-2.log`, `/tmp/b5b-r2-2.json` |
| `b5b-r2 3 row-level splice` | Main completes; trusted request changes lease columns from e/d/c/a to e/d/c/b | Whole-table serialization changes untouched text and rounds unknown 9007199254740993 to 9007199254740992 | `/tmp/b5b-r2-3.log`, `/tmp/b5b-r2-3.json` |

Combined: `/tmp/b5b-r2-all.log` and `/tmp/b5b-r2-all.json`, 3 expected failures, no skips.
Runner TypeScript (`--noEmit`) passes: `/tmp/b5b-r2-tsc.log`.
ESLint on the new test passes: `/tmp/b5b-r2-eslint.log`.
No existing test was modified, deleted, weakened or run for a replacement assertion.

An initial fixture gave all three Source/Concept inputs identical bytes, so normal
deduplication correctly filed only the first input. The final fixture uses distinct
made-up content; no production behavior or contract assertion was relaxed. A temporary
diagnostic of result paths was removed before final verification.

### Exact commands and output isolation

Run from `runner/`. The OS-temp config imports the existing runner configuration,
disables test cache, moves Vite cache and JSON output to OS temp, and substitutes an
OS-temp setup retaining the exact existing timer gate. Only its optional repository-writing
CPU report is omitted; the repository setup and node_modules are unchanged.

Config: `/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b5b-r2-runner.config.mts`.
Setup: `/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b5b-r2-timer-setup.ts`.
The existing corpus-run helper also writes its main event files to `os.tmpdir()`.

```sh
pnpm exec vitest run test/b5b-r2.test.ts -t 'b5b-r2 1 source role by one helper' --config /var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b5b-r2-runner.config.mts --configLoader runner --maxWorkers=2 --outputFile.json=/tmp/b5b-r2-1.json > /tmp/b5b-r2-1.log 2>&1
pnpm exec vitest run test/b5b-r2.test.ts -t 'b5b-r2 2 more than four columns' --config /var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b5b-r2-runner.config.mts --configLoader runner --maxWorkers=2 --outputFile.json=/tmp/b5b-r2-2.json > /tmp/b5b-r2-2.log 2>&1
pnpm exec vitest run test/b5b-r2.test.ts -t 'b5b-r2 3 row-level splice' --config /var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b5b-r2-runner.config.mts --configLoader runner --maxWorkers=2 --outputFile.json=/tmp/b5b-r2-3.json > /tmp/b5b-r2-3.log 2>&1
pnpm exec vitest run test/b5b-r2.test.ts --config /var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b5b-r2-runner.config.mts --configLoader runner --maxWorkers=2 --outputFile.json=/tmp/b5b-r2-all.json > /tmp/b5b-r2-all.log 2>&1
pnpm exec eslint test/b5b-r2.test.ts > /tmp/b5b-r2-eslint.log 2>&1
# From the worktree root:
pnpm exec tsc -p runner/tsconfig.json --noEmit > /tmp/b5b-r2-tsc.log 2>&1
```

removed: none; no existing test or production mechanism changed.
Contradictions: none in the requested controls or ruling; unrelated suites were not run.
Calls/timing: no call budget or timing acceptance measured or changed in this red session.
Left out: addendum 10 (4)'s live-proposal red remains the ruled second step; implementation,
full suites, pnpm check, e2e and designer verification remain for later authorized sessions.
Risk: the three production data-safety defects remain intentionally unfixed here.


## Round 1 (addendum 10)

Implementer: codex; ponytail full. Implements only TL-P4-47 addendum 10 (1)–(3),
from the adversarial note and the three existing Round 1 reds. The live proposal
path in (4) remains the authorized second step. No test, dependency, fixture,
shared harness record or app screen was changed. No network, git write, commit,
node_modules replacement or symlink was used. The runner commits the two groups
in `.codex-commits.json` and owns pnpm check and capabilities/folder-table e2e.

### Scope, reuse and safety

- `note-format.ts` is still the one declaration reader and format home.
  `bowerNoteRole` reads the declared `bower_template` role with the existing
  ownership/frontmatter parser. Creation already stores a classified row's
  template there, so an offer Source retains the Source role independently of
  its classification id. Only legacy notes fall back to their template type;
  `by: bower` remains required. The helper is the one role decision used by
  `applyAtVersion`, hence applyChanges, planner, effect recheck and stored
  satisfaction callers. No note model, public field or stored shape changes.
- Stored rows with more than four columns pass the existing stored validator;
  `readTypeTable` projects their first four. Strict new writes still reject
  more than four. Empty/all-invalid readable tables retain their in-memory
  fallback seeds for context but their stored bytes are never automatically
  replaced. Unreadable files retain seed context and prohibit writes that run.
- `rewriteTypeTable` replaces whole-table JSON serialization inside the existing
  planner write. JSON.parse/readTypeTable remain the schema validators; a
  private lexical span scan locates only direct JSON values to splice. Existing
  rows change only the requested table value. Other text, envelope extensions,
  changed-row extension keys, skipped rows and duplicate skipped ids retain
  their exact bytes, including `9007199254740993`. Explicit accepted rows are
  inserted before the original first generic fallback, or appended otherwise;
  no seed rows are implicitly installed. A conflicting skipped id is refused
  rather than overwritten. The existing read-version fence and write effect
  are unchanged; no parser for schema admission, loader, writer or store added.
- The existing manifest guard retains strict new-table validation. Stored
  rewrites may carry skipped rows alongside a valid declaration being changed
  or added; entirely invalid rewritten tables still fail the guard. New rows
  still pass strict validation in insertTypeRow and the splicer. The existing
  id/version/content checks stay intact.

Research: reused the packet's local tolerant-read precedent
https://www.rfc-editor.org/rfc/rfc9413.html and closed-write schema precedent
https://json-schema.org/understanding-json-schema/reference/object#additionalproperties,
and the existing note-edit practice of preserving bytes outside a changed span.
No external source was fetched or independently reverified under the no-network rule.

removed: applyAtVersion's per-site type-property lookup for template immutability; bowerNoteRole decides declared/legacy role once.
removed: the four-column stored-read rejection; only strict new writes enforce that cap.
removed: the planner's parsed-table comparison that automatically rewrote readable empty/all-invalid/projected tables as seeds.
removed: whole-table JSON serialization on existing-table writes; unchanged rows and extension keys retain original text.
tests changed: none; all existing reds, assertions, fixtures, bounds and 99/97 pins are unchanged.

### Compatibility draft

Coordinator-owned final compatibility rows remain for the runner's production commit.
Each changed contract mechanism is listed separately; no src/features file changed.

| Changed home | Contract change | Existing callers/stored data | Evidence |
| --- | --- | --- | --- |
| src/data/contracts/note-format.ts: bowerNoteRole | Read declared role independently of classification; legacy template type is the fallback | No public/stored shape change; personal typed Source/MOC remains editable | b5b-r2 1; note-format and note-edit suites; OS-temp role assertions |
| src/data/contracts/note-edit.ts: applyAtVersion | Template immutability and Timeline support use the single role helper | Applies to planner, adapter recheck and current satisfaction callers; stored version-1 satisfaction unchanged | b5b-r2 1; full app and runner suites |
| src/data/contracts/note-format.ts: typeRowOk/readTypeTable | Stored columns project first four instead of rejecting the row | Strict new writes retain four-column limit; existing callers get the same reader result shape | b5b-r2 2; type-table contracts and 99/97 controls |
| src/data/contracts/note-format.ts: rewriteTypeTable | Splice requested table values and explicitly added rows while retaining all other bytes | Skipped stored rows, extensions and unsafe-size unknown integers survive; no implicit reseed | b5b-r2 3; OS-temp splicer assertions and production-main skipped-row assertion |
| src/data/contracts/run-manifest.ts: planningArtifactsOk | Stored rewrites can retain skipped rows alongside valid declarations | Strict new-table and entirely-invalid-write refusals remain; id/version/content fences unchanged | 1779 affected contract tests; production-main skipped-row assertion |
| src/data/spine/scripted.ts: tableWrite | Only missing tables or explicit table actions plan a write; use the shared splicer | Readable empty/all-invalid tables keep stored bytes; unreadable tables still prohibit writes | full runner; two contradictory old reseed cases listed below |

### Verification and exact contradictions

Red before editing: `/tmp/b5b-round1-red.log` and `.json`, all three existing
`b5b-r2` tests fail on their named safety assertions; no import/collection failures.
The unchanged positive controls pass. First green: `/tmp/b5b-round1-targeted.log`
and `.json`, all three pass. Final full-suite results and commands follow below.

Supplemental assertions stayed outside the repository, in OS temp:

- `/tmp/b5b-round1-selfcheck.mjs`, bundled shared contracts: row/table splices,
  nested strings/arrays, escaped rows key, unchanged unknown integers, skipped
  null/invalid rows, explicit insertion before generic fallbacks, insertion into
  empty/all-invalid tables without seeds, unreadable refusal, strict first
  creation and declared/legacy/personal Source-role controls all pass.
  Output: `/tmp/b5b-round1-selfcheck.log`.
- `/tmp/b5b-round1-skipped-main.ts`, using the existing corpus loader, in-memory
  Drive transport and real production main with the scripted provider: an
  explicit column request preserves null/invalid rows and the exact unknown
  integer through planning, manifest parsing and application. Exact after-text
  differs only in the requested table value. Output: `/tmp/b5b-round1-main.log`.
- An initial self-check fixture lacked v:1; it was corrected in OS temp. Initial
  main probe omitted the helper's required press argument and could not obtain
  its fake token; adding press=1 made the real path pass. No source or assertion
  was relaxed for those fixture mistakes.

All old runner contradictions, complete list after the full suite:

- `runner/test/b5-incorporation.test.ts:170`, parameter
  `{"v":1,"rows":[]}`: :173 expects eight stored seeds, and :174 expects a
  table rewrite during unrelated filing. Addendum 10 (2) prohibits this rewrite
  of a readable stored table. Actual bytes remain exactly the empty table.
- Same test/file/lines, parameter `{"v":1,"rows":[{"id":"bad"}]}`:
  :173 expects eight seeds replacing the skipped row and :174 a rewrite.
  Addendum 10 (2) requires the stored skipped row to survive. Actual bytes
  remain exactly the original all-invalid table. Both cases are left unchanged.

The null/missing-table first-create control still passes. Neither contradiction
is an invitation to restore reseeding or edit the old tests. They prevent claiming
an all-green runner gate; coordinator/lead resolution is needed outside this diff.

The first broad app run exposed the existing manifest's all-invalid-write refusal
when its guard was made too permissive. The final guard retains that refusal and
accepts mixed retained skipped rows only beside valid declarations. All 1779
affected note-edit/note-format/run-manifest tests pass after the correction
(`/tmp/b5b-round1-contracts-final.log` and `.json`); no test changed.

Tests use the existing OS-temp configs recorded in Round 1 reds and attempt 6.
They import the repository's configurations, keep its setup and exact timer gate,
move Vite cache/JSON output to OS temp and disable test cache. Only the optional
CPU reporter that writes repository artifacts is omitted. Tests and self-checks
write no generated artifacts into the checkout. No tracked config/setup changes.

```sh
# From runner/:
pnpm exec vitest run --config /var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/b5b-r2-runner.config.mts --configLoader runner --maxWorkers=2 --outputFile.json=/tmp/b5b-round1-runner-final.json > /tmp/b5b-round1-runner-final.log 2>&1
# From the worktree root:
pnpm exec vitest run src --config /tmp/b5b-a6-app.config.mts --configLoader runner --maxWorkers=2 --outputFile.json=/tmp/b5b-round1-src-final.json > /tmp/b5b-round1-src-final.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false > /tmp/b5b-round1-tsc-app-final.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit --incremental false > /tmp/b5b-round1-tsc-node-final.log 2>&1
pnpm exec tsc -p runner/tsconfig.json --noEmit > /tmp/b5b-round1-tsc-runner-final.log 2>&1
pnpm exec eslint src/data/contracts/note-format.ts src/data/contracts/note-edit.ts src/data/contracts/run-manifest.ts src/data/spine/scripted.ts > /tmp/b5b-round1-eslint-final.log 2>&1
node scripts/check-unused-gate.mjs > /tmp/b5b-round1-unused-final.log 2>&1
```

### Final results on the production diff

| Check | Result | OS-temp log |
| --- | --- | --- |
| Full runner, --maxWorkers=2 | 756 pass / 2 contradictory old reseed cases; 60 files | /tmp/b5b-round1-runner-final.log |
| All three b5b-r2 reds, in full runner | 3/3 pass | /tmp/b5b-round1-runner-final.log |
| Full vitest run src, --maxWorkers=2 | 5830 pass / 1 expected sandbox failure; 180 files | /tmp/b5b-round1-src-final.log |
| App TypeScript, no emit/incremental | pass | /tmp/b5b-round1-tsc-app-final.log |
| Node TypeScript, no emit/incremental | pass | /tmp/b5b-round1-tsc-node-final.log |
| Runner TypeScript, no emit | pass | /tmp/b5b-round1-tsc-runner-final.log |
| ESLint, all four touched production files | pass | /tmp/b5b-round1-eslint-final.log |
| node scripts/check-unused-gate.mjs | pass; 2 known general / 29 known production findings; no new ones | /tmp/b5b-round1-unused-final.log |
| git diff --check, read-only | pass | empty command output |

The complete final src failure list has one entry: `src/e2e-port.test.ts:37`,
"a server from another worktree is never reused": sandbox listen EPERM causes
its 5000 ms timeout and one unhandled listen error, as expected in the assignment.
The manifest's invalid-write refusal passes in the final full src run. The old
compatibility ledger test also passes; no shared ledger was edited here.
The 99-call first-create and 97-call existing-table golden/timing controls pass
in the final runner suite. No call/timing pin or tolerance changed.

All production edits preceded the final full app and runner runs. Only this
notes append and the commit manifest were written afterward. Two commit groups
are supplied, production and notes alone. Delivery remains blocked on the two
unchanged older runner assertions, with the safety fixes complete and all three
new reds green. No further implementation or test edit is implied by that status.

left out: live proposal path (addendum 10 (4)), runner-owned commits/pnpm check/e2e and coordinator compatibility records.
Risk: unchanged older reseed tests block the runner suite; deferred browser gates remain unverified here.


## Round 1 red repair (TL-P4-51)

Tests-only repair authorized for TL-P4-47 addendum 10 (2). The two entries in
Round 1's "All old runner contradictions" list above are now resolved; that
list and its blocked result remain historical evidence of the production round.
No production code, fixtures, ids, byte assertions or fences were changed.

Scope: runner/test/b5-incorporation.test.ts, this notes append and the runner's
commit manifest. No callers, exports, dependencies or repository configs need changes.
The existing real main, fake Drive, filing helper and manifest-effects helper are reused.
Research: local packet and addendum 10, with the packet's bounded tolerant-read
reference https://www.rfc-editor.org/rfc/rfc9413.html; no network verification.

tests changed: runner/test/b5-incorporation.test.ts: empty stored table parameter
now asserts exact original bytes and no table-targeted effect, because a readable
stored table must never be reseeded during unrelated filing (addendum 10 (2)).
tests changed: runner/test/b5-incorporation.test.ts: all-invalid stored table parameter
now asserts exact original bytes, including the skipped {"id":"bad"} row, and no
table-targeted effect, because skipped rows must survive (addendum 10 (2)).
Both parameters still require code 0 and Garden.txt filed at Resources/Garden.
The null/missing-table control keeps its existing fixture, eight-seed assertion
and write-runner-json creation assertion. Every other test stays unchanged.

Before repair, the full b5-incorporation file reproduced both contradictions:
28 passed / 2 failed; each failed on the eight-seed and rewrite assertions.
Log: /tmp/b5b-repair-red.log; JSON: /tmp/b5b-repair-red.json.

Verification, in the requested order (targeted file, full runner, then static checks):

- b5-incorporation.test.ts: 30/30 passed; /tmp/b5b-repair-target.log and .json.
- Full runner with --maxWorkers=2: 758/758 passed, 60 files;
  /tmp/b5b-repair-runner.log and .json. No remaining runner contradictions.
- tsc -p runner/tsconfig.json --noEmit: passed; /tmp/b5b-repair-tsc.log.
- ESLint test/b5-incorporation.test.ts from runner/: passed;
  /tmp/b5b-repair-eslint.log.
- git diff --check (read-only): passed.

Vitest reused the existing OS-temp b5b-r2-runner.config.mts with --configLoader runner,
cache disabled, OS-temp cacheDir/outputFile and the existing OS-temp timer setup.
The same timer gate and allowlist are retained; only repository-writing CPU reporting
is omitted. No test outputs were written into the repository. node_modules untouched.

Commit groups are supplied in .codex-commits.json: test repair, then notes alone.
The runner owns committing; no git write command was run.
left out: production changes, pnpm check and browser/e2e gates; this assignment is tests only.
Risk: broader app/browser gates remain unverified in this repair; all requested checks passed.
