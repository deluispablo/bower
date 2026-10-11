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
