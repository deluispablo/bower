# B1b ports — red session notes

implementer: codex

Entry: `b1b-ports`. Red author: separate Codex session. Worktree: `/private/tmp/bower-b1b-ports`.
No commits were made; the coordinator owns committing the reds and this separate notes file.

## Scope and API under test

Only packet points 1–3 are covered. Existing test bodies are unchanged. The shared test harness is
`src/data/drive/drive-contract.ts`; the HTTP, fake and parity test files register the new cases.
No production adapter, runner, retrieval state, cursor persistence, index or UI code was changed.

The test-local `B1Ports` interface pins these names and result shapes without importing absent symbols:

- `readPrefix(id): Promise<string | null>`: 4,096 UTF-8 bytes, dropping an incomplete trailing character;
  an empty note or 416 yields `''`, and Google Docs/exports yield `null` without a media/export read.
- `getStartPageToken(): Promise<string>`.
- `listChanges(pageToken): Promise<{ changes, newStartPageToken }>`: drains every page and preserves
  raw feed order, repeated entries, unrelated My Drive changes and removed stubs.
  A change is `{ fileId, removed, file? }`, where `file` has the existing `DriveFile` shape.
- `parents(id): Promise<string[]>`: metadata only.
- `resolveScope(rootId, unknownIds): Promise<{ inScopeIds, outOfScopeIds, needsFullListing }>`:
  walks ancestry for at most 50 unknown live ids. At 51 it reports `needsFullListing: true` with empty
  result arrays, without walking parents or starting a full listing; the caller decides the listing.
  Removed stubs stay in the raw drain and are left to the caller's cached tree.
- `ReadCache.prefix(version, read): Promise<string | null>`: separate from full text and byte entries.

Every absent method is guarded by `expect(typeof candidate).toBe('function')` before use. These are
assertion reds, not load errors or TypeScript failures. The implementer may not change these reds.

## Fixtures and positive controls

The HTTP tests pass an injected recording fetch to the real `DriveHttp`, following the existing
recorded-transport pattern. It answers from the existing `FakeDrive` for files/bytes and from scripted
Drive v3 pages for the feed. It never reaches a network. The direct fake tests use `FakeDrive.restore`
with the existing injected options mechanism and a test-local options extension:

- `prefixResponses: Record<fileId, 206 | 200 | 416>` selects a note's simulated prefix response;
  the short control selects 206. The 416 HTTP body contains an error sentence, which is not prefix text.
- `startPageToken: string` and `changePages: Record<pageToken, B1ChangePage>` script all feed pages.
  `B1ChangePage` is `{ changes, nextPageToken?, newStartPageToken? }` with normalized change files.

These options are fixture contracts for the implementation, not fake ports implemented by the red.
The fake does not consume them yet. Fake snapshot metadata carries `mimeType` for excluded Docs and Sheets
(named `Note.md` deliberately, so extension matching cannot pass that exclusion).

Every new case first verifies existing full-media and metadata reads on a short Unicode control.
Prefix cases also verify that the new prefix port reads the complete short control; feed drains have an
empty terminal-page control; ancestry cases have a direct-child/empty-list control. Cache cases first
verify the existing full-text cache. All observed failures happen after the existing controls pass.

Both adapters are started in every parity case with `Promise.all`; each must satisfy the same expected
result before their complete result shapes are compared. The shared contract separately exercises each
adapter, so one adapter's missing port cannot conceal the other's failure.

`b1-feed-bootstrap-new-folder` takes the start token before a real bootstrap listing, verifies the
folder is absent, then creates the folder/note on the backing fake as another device would. The three
feed pages contain that unknown folder, an unrelated file, a removed stub and a repeated note change.
The scoped result includes the folder/note and excludes the unrelated file; the raw drain retains all
five changes and only the terminal `newStartPageToken`. No cursor is committed.

All new suites use fake timers, a fixed injected fake clock, zero fake latency and zero retry backoff.
No live Drive, credentials, real waits, focused tests or skipped tests are added. All data is made up.

## Verification

- `pnpm exec vitest run src/data/drive --maxWorkers=2 > tmp-logs/b1b-red.log 2>&1`:
  **54 expected assertion failures, 223 existing tests passed**, no unrelated failure or unhandled error.
- `pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/b1b-tsc.log 2>&1`: **passed**.
  This project includes every touched TypeScript file under strict settings.
- `pnpm exec eslint src/data/drive/drive-contract.ts src/data/drive/drive-http.test.ts src/data/drive/fake-drive.test.ts src/data/drive/parity.test.ts > tmp-logs/b1b-eslint.log 2>&1`: **passed**.
- `git diff --check`: **passed**, read-only git. No git command that writes was run.
- Runner drive tests were not run: no runner file was touched. Full `pnpm check`, e2e and runner goldens
  are left for implementation/integration; this assignment is intentionally red-only and has no UI.

The log was audited by failure group and exact test name: all 54 failures are the missing-port assertions
listed below. No port's downstream behavior is claimed to work before implementation.

## Reds

The suite prefix is `B1b ports: http`, `B1b ports: fake`, or `B1b HTTP and fake port parity`.
The table uses each exact leaf test name; file plus name identifies every test uniquely.

| File | Exact test name | Why it fails now |
| --- | --- | --- |
| `src/data/drive/drive-http.test.ts` | `b1-changes-feed 50 unknown ids` | `B1b resolveScope port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-changes-feed 51 unknown ids` | `B1b resolveScope port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-changes-feed multi-page drain` | `B1b listChanges port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-changes-feed parents lookup` | `B1b parents port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-changes-feed removed stubs and unrelated account changes` | `B1b listChanges port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-changes-feed start token` | `B1b getStartPageToken port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-changes-feed unknown id scope walk` | `B1b resolveScope port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-feed-bootstrap-new-folder` | `B1b getStartPageToken port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-prefix-read 200 full cut at 4096 bytes` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-prefix-read 200 split UTF-8 character` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-prefix-read 206 prefix` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-prefix-read 206 split UTF-8 character` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-prefix-read 416 empty note` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-prefix-read Google Docs excluded` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-prefix-read Google Sheets export excluded` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-prefix-read empty body` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-prefix-read never poisons the full-media cache` | `ReadCache.prefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/drive-http.test.ts` | `b1-prefix-read whole UTF-8 character at byte 4096` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-changes-feed 50 unknown ids` | `B1b resolveScope port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-changes-feed 51 unknown ids` | `B1b resolveScope port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-changes-feed multi-page drain` | `B1b listChanges port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-changes-feed parents lookup` | `B1b parents port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-changes-feed removed stubs and unrelated account changes` | `B1b listChanges port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-changes-feed start token` | `B1b getStartPageToken port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-changes-feed unknown id scope walk` | `B1b resolveScope port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-feed-bootstrap-new-folder` | `B1b getStartPageToken port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-prefix-read 200 full cut at 4096 bytes` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-prefix-read 200 split UTF-8 character` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-prefix-read 206 prefix` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-prefix-read 206 split UTF-8 character` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-prefix-read 416 empty note` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-prefix-read Google Docs excluded` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-prefix-read Google Sheets export excluded` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-prefix-read empty body` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-prefix-read never poisons the full-media cache` | `ReadCache.prefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/fake-drive.test.ts` | `b1-prefix-read whole UTF-8 character at byte 4096` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity changes feed 50 unknown ids` | `B1b resolveScope port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity changes feed 51 unknown ids` | `B1b resolveScope port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity changes feed b1-feed-bootstrap-new-folder` | `B1b getStartPageToken port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity changes feed multi-page drain` | `B1b listChanges port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity changes feed parents lookup` | `B1b parents port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity changes feed removed stubs and unrelated account changes` | `B1b listChanges port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity changes feed start token` | `B1b getStartPageToken port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity changes feed unknown id scope walk` | `B1b resolveScope port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity full-media cache separation` | `ReadCache.prefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity prefix 200 full cut at 4096 bytes` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity prefix 200 split UTF-8 character` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity prefix 206 prefix` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity prefix 206 split UTF-8 character` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity prefix 416 empty note` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity prefix Google Docs excluded` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity prefix Google Sheets export excluded` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity prefix empty body` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |
| `src/data/drive/parity.test.ts` | `b1-ports-parity prefix whole UTF-8 character at byte 4096` | `B1b readPrefix port` is absent: expected `function`, received `undefined`. |

## Drive docs

Official references carried by the packet and B1 prep, cited as the protocol basis. This red session
obeyed the no-network instruction: none was fetched or independently reverified, and no live capability
probe is claimed. Q3 explicitly accepts both 206 and ignored-Range 200 and requires no live probe.

- [Download files / partial download](https://developers.google.com/workspace/drive/api/guides/manage-downloads):
  stored-file `alt=media` with `Range`; Google Workspace export is a separate path.
- [files.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get):
  media download and metadata/parents lookup through the existing authenticated transport.
- [HTTP Range semantics, RFC 9110 §14](https://www.rfc-editor.org/rfc/rfc9110.html#section-14),
  [206, §15.3.7](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.7),
  [416, §15.5.17](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.17):
  range responses and an unsatisfiable range; a server may ignore Range, covered by the 200 fallback.
- [Changes guide](https://developers.google.com/workspace/drive/api/guides/manage-changes):
  capture a start token before bootstrap, then drain the changes feed.
- [changes.getStartPageToken](https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/getStartPageToken):
  the initial start token. This method has no `restrictToMyDrive` parameter.
- [changes.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list):
  `pageToken`, `nextPageToken`, terminal `newStartPageToken`, removed changes, file metadata;
  the recorded HTTP tests require `restrictToMyDrive=true`, `spaces=drive`, `includeRemoved=true`,
  requested parent fields and no shared-drive id.

## Reuse and handoff

Keep the token/retry/error transport in `DriveHttp`, fake simulation in `FakeDrive`, and prefix/full
separation in `ReadCache`. The existing Bin ancestry lookup in `drive-http.ts` already walks `parents`;
share that ancestry mechanism when adding the new scope port, rather than adding a second production
fetch stack or scoped tree. `RunnerDrive` already delegates reads to that transport and owns its cache;
this packet's reds introduce no runner-local transport, parser or indexer.

Errors remain the existing BowerError/error-mapping mechanism. Transport error-policy testing outside
the requested 416 handling is left out; the existing transport tests remain unchanged and pass.
Shared-drive support, retrieval.json, cursor commit and index building are left out as ruled.

removed: none
tests changed: no existing test body, assertion, name, bound or fixture was changed or deleted.
Tests added only; imports and suite registration were extended in the four files listed above.

## Implementation

Status: blocked before product edits. The implementation assignment forbids changing any test, but
`src/data/drive/drive-ops.test.ts:10–36` pins the complete existing DriveApi method set twice:
`EXPECTED satisfies Record<keyof DriveApi, 'read' | 'write'>` and an exact equality assertion against
`DRIVE_OPS`. The five required ports (`readPrefix`, `getStartPageToken`, `listChanges`, `parents`,
`resolveScope`) are absent from that expected table. Adding them to DriveApi necessarily invalidates
the test's TypeScript completeness check; registering them as reads in DRIVE_OPS necessarily breaks
`the table classes each method as expected`. These are source-level consequences, not additional
observed failures in the unchanged baseline.

The coordinator needs an authorized red update for that existing table before implementation can
meet both the public-port contract and the requested green gates. Its five new entries must be
classified as reads. Omitting the ports from DriveApi, hiding their DRIVE_OPS entries, or weakening
the table's completeness would evade the existing lease-policy contract. None was done.

Changed: this notes file only. No product or test file was edited; no git command that writes was run.
The committed reds were reproduced through the real HTTP/fake adapters and parity suite, with
**54 missing-port assertion failures and 640 existing passing tests** across Drive and vault.
The app, node and runner TypeScript checks passed on the unchanged product baseline.

Logs (all commands redirected; only failure output was read):

- `tmp-logs/b1b-before.log`: `pnpm exec vitest run src/data/drive src/data/vault --maxWorkers=2`;
  54 failures, all the committed B1b reds, and 640 passing tests.
- `tmp-logs/b1b-tsc-app.log`: `pnpm exec tsc -p tsconfig.app.json --noEmit`; exit 0.
- `tmp-logs/b1b-tsc-node.log`: `pnpm exec tsc -p tsconfig.node.json --noEmit`; exit 0.
- `tmp-logs/b1b-tsc-runner.log`: `pnpm -C runner exec tsc --noEmit`; exit 0.

No TypeScript file was touched, so no touched-file eslint run was applicable. Runner Drive tests
were not run because runner/src/drive.ts was not changed. No pnpm check, e2e, network or live probe
was run. No src/data/contracts file changed; no compatibility-row draft is needed.

Research basis: the official Drive download/Range, changes guide, getStartPageToken, changes.list
and RFC 9110 links in the Drive docs section above, plus the packet's local Q3/Q10 rulings and B1b
prep. References were read from those supplied local documents; no online verification is claimed.

removed: none
tests changed: none in this implementation session.
left out: all product implementation pending the authorized Drive method-table red update.

## Red repair: the DriveApi table

Extended only `EXPECTED` in `src/data/drive/drive-ops.test.ts` with `readPrefix`,
`getStartPageToken`, `listChanges`, `parents` and `resolveScope`, each classed `'read'`.
These names match `B1Ports` in `src/data/drive/drive-contract.ts` exactly.
The `satisfies Record<Method, 'read' | 'write'>` completeness check and exact equality
assertion against `DRIVE_OPS` are unchanged; no product code was changed.

tests changed: src/data/drive/drive-ops.test.ts: extend the complete expected method table with the five B1b read ports.

Verification: `pnpm exec vitest run src/data/drive/drive-ops.test.ts --maxWorkers=2 > tmp-logs/b1b-ops.log 2>&1`
exited 1 with **2 assertion failures and 1 passing test**, not a load error.
`the table classes each method as expected` reports all five missing `DRIVE_OPS` entries.
`the lease guard lets every read through and guards every write` reports those same five
reads as guarded because their table entries are absent. The lost-lease upload test passes.
Log: `tmp-logs/b1b-ops.log`.

No network or git write command was run. No commits were made; the coordinator commits.
Research basis: existing method-table and lease-policy tests, with protocol references
already recorded in the Drive docs section; no online verification was performed.
removed: none
left out: product implementation, pnpm check and e2e; this assignment repairs the red only.

## Implementation — product ports (2026-10-10)

Status: **blocked on unchanged test contracts**, with the product implementation left in this
worktree for the coordinator. Base HEAD: `cfd2ec605d046bbc93dcf0a7032636680416322b`.
No test, shared harness record, runner file or src/data/contracts file was changed. No git command
that writes, network request, pnpm check or e2e was run. The coordinator owns the fix/notes commits.

### Product changes

- `src/data/drive/drive-api.ts`: the five required ports are required DriveApi methods and are
  classified as reads in DRIVE_OPS. Added the normalized change/page/drain/scope types, shared
  4,096-byte streaming UTF-8 decode, terminal-token page drain and ancestry lookup. The drain
  retains raw order, repeats, removed stubs and unrelated entries; missing terminal tokens and
  repeated page tokens reject with a one-sentence BowerError and console details.
- `src/data/drive/drive-http.ts`: prefix metadata excludes Google Workspace media before a
  download; media uses the existing call/authorized/send transport with Range bytes=0-4095.
  Both 206 and ignored-Range 200 are cut and decoded; 416 returns empty text without interpreting
  its error body as content. Start-token and My Drive changes requests use that same transport;
  changes.list requests parents and drains every page. Parents lookup is metadata only.
  The existing media-body error mapping is extracted and reused for the new response bodies.
  Full-media readBytes retains its existing double Uint8Array copy expression.
- `src/data/drive/fake-drive.ts`: consumes the recorded prefix/status and feed-page options from
  the committed fixtures, including Workspace MIME metadata retained in snapshots. It uses the
  same decode, drain and scope helpers as HTTP. Without recorded pages, tokens address this
  instance's in-memory change sequence, recorded through the existing changed hook and touch.
  That simulation is not durable across snapshot restoration; no persisted cursor/state is added.
- `src/data/drive/read-cache.ts`: prefix gets its own kind in the existing once/single-flight
  version cache, separate from full text and bytes, including cached null results.

Scope resolution walks every parent path to the root, shares metadata reads and stops cycles.
The 51-id case returns needsFullListing before any parent read or listing. No new scoped tree or
transport was added. HTTP Bin ancestry keeps its existing depth-eight bound and beforeGet hook;
the fake's Bin lookup also uses the shared ancestry helper without adding gated Drive calls.

removed: src/data/drive/drive-http.ts: inline Bin ancestry implementation, replaced by ancestryLookup and parents.
removed: src/data/drive/fake-drive.ts: inline first-parent Bin walk, replaced by the shared ancestry lookup.
removed: src/data/drive/drive-http.ts: inline readBytes body catch, extracted unchanged into readBody.
tests changed: none in this implementation session; the repaired method-table red is unchanged.

### Verification and logs

Every command redirected its output under tmp-logs; only failures and aggregate counts were read.

| Log | Command / result |
| --- | --- |
| `tmp-logs/b1b-implementation-red.log` | `pnpm exec vitest run src/data/drive src/data/vault --maxWorkers=2`: exit 1; 56 expected missing-port/table assertion failures, 638 passing tests. |
| `tmp-logs/b1b-implementation-green.log` | Same command after the first product pass: exit 1; 18 failures, 676 passes. |
| `tmp-logs/b1b-implementation-final.log` | Same command after final body-error mapping: exit 1; the same 18 failures, 676 passes, no unhandled error. |
| `tmp-logs/b1b-implementation-tsc-app.log` | `pnpm exec tsc -p tsconfig.app.json --noEmit`: exit 2; one test-only DriveApi wrapper lacks the five required methods. |
| `tmp-logs/b1b-implementation-tsc-node.log` | `pnpm exec tsc -p tsconfig.node.json --noEmit`: exit 0. |
| `tmp-logs/b1b-implementation-tsc-runner.log` | `pnpm -C runner exec tsc --noEmit`: exit 0, repeated after final edits. |
| `tmp-logs/b1b-implementation-eslint.log` | `pnpm exec eslint src/data/drive/drive-api.ts src/data/drive/drive-http.ts src/data/drive/fake-drive.ts src/data/drive/read-cache.ts`: exit 0, repeated after final edits. |

`git diff --check` passed. `git diff --numstat -- '*.test.ts' src/data/drive/drive-contract.ts`
was empty. All 638 pre-existing targeted tests pass, including their Drive-call expectations;
no golden or bound was edited. Both repaired drive-ops.test.ts assertions now pass. All direct
fake B1b cases pass. Runner drive tests were not run because runner/src/drive.ts was untouched.

### Remaining failures and required red-owner decisions

1. **App TypeScript:** `src/data/live/live.test.ts:1303` returns an explicit DriveApi object from
   `client(backend)` that forwards all old methods but omits readPrefix, getStartPageToken,
   listChanges, parents and resolveScope. Required public ports make this a TS2739 error.
   The red owner needs to extend that test-only wrapper. Making these ports optional, dropping
   them from DriveApi or excluding the test from compilation would weaken the public contract.

2. **Two bootstrap assertions:** `b1-feed-bootstrap-new-folder` in drive-http.test.ts and
   `b1-ports-parity changes feed b1-feed-bootstrap-new-folder` in parity.test.ts reach
   `drive-contract.ts:333`. `b1AssertMyDrive` filters every URL containing `/changes`, including
   `/changes/startPageToken`, then requires restrictToMyDrive=true. The same file's start-token
   case at line 345 and this notes file's Drive docs explicitly state that getStartPageToken has
   no such parameter. The bootstrap drain, new folder/note membership, unrelated id exclusion,
   removed stub and repeated change assertions all pass before this contradictory assertion.
   The red owner needs to apply the My Drive parameter assertion to changes.list requests.
   No unsupported parameter was added to product requests solely to satisfy that assertion.

3. **Sixteen byte-equality assertions:** seven non-export prefix cases plus the cache case in
   each of the HTTP and parity suites reach `drive-contract.ts:316` or `:451` after prefix/text
   checks pass. Vitest reports `Compared values have no visual difference`, including empty
   Uint8Arrays. Expected bytes are from TextEncoder; HTTP bytes use the unchanged Uint8Array
   copy expression from the existing readBytes implementation. The likely cause is cross-realm
   typed-array equality in the jsdom environment (`vite.config.ts:45`), rather than truncated
   full media. This is a diagnosis inference, not an independently instrumented runtime proof.
   The red owner should verify the realm mismatch and compare normalized byte arrays without
   weakening the expected content or copy guarantee. No test-environment or byte-constructor
   workaround was added to production code to force those assertions green.

The first blocker alone prevents a green app typecheck under the assignment's no-test-edit rule.
These failures are not claimed as green or waived. Product edits remain reviewable and uncommitted.

### Research and compatibility

Research used the packet, Q3/Q10, B1b prep's mechanism/documentation sections and the official
protocol links already supplied locally. No online verification or live probe is claimed:

- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://developers.google.com/workspace/drive/api/guides/manage-changes
- https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/getStartPageToken
- https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list
- https://www.rfc-editor.org/rfc/rfc9110.html#section-14

No src/data/contracts file changed, so no compatibility-row draft is needed. The public DriveApi
extension requires callers that build explicit adapter objects to forward the new read methods.

left out: retrieval.json, cursor commit, index building, shared drives, UI, pnpm check and e2e as instructed.
left out: red-owner repairs above; this implementer is explicitly forbidden to change any test.

## Red repair 2

Repaired the three authorized red-owner issues in test code only. No product code, contract
number, fixture, test name, threshold or golden changed. No network or git write command ran;
the coordinator owns commits.

1. Extended the explicit test-only `client(backend)` DriveApi wrapper with direct forwarding of
   readPrefix, getStartPageToken, listChanges, parents and resolveScope, preserving all arguments.
   Before repair, app tsc reproduced TS2739 at live.test.ts:1303 (log below).
2. Verified the locally supplied Drive docs section above: changes.getStartPageToken has no
   restrictToMyDrive parameter, while changes.list does. Restricted only that parameter assertion
   to paths ending in `/changes`. GET, no driveId and authorization assertions still apply to
   both start-token and list requests. The existing start-token path assertion remains intact.
   Sources: https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/getStartPageToken
   and https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list.
   This is verification from the supplied notes, not a fresh online documentation fetch.
3. Confirmed the byte realm mismatch with temporary runtime instrumentation under the existing
   jsdom Vitest environment, then removed the instrumentation. For all seven HTTP non-export
   prefix cases and the HTTP cache case (also exercised via parity), actualLocal was true,
   expectedLocal was false and prefix samePrototype was false. Actual and expected lengths
   were identical (0, 4111 or 4114), with every byte equal. Fake bytes and TextEncoder expectations
   shared a prototype, both distinct from the jsdom Uint8Array.prototype. The instrumented run
   reproduced all 18 reported assertion failures: sixteen bytes and two bootstrap assertions.
   Log: `tmp-logs/b1b-redfix2-realm.log`.

The two shared byte assertions now compare Array.from on both sides, retaining exact ordered
content and length. The first full run reached a previously masked equality failure in the
cache parity result (804 pass, 1 fail). Normalized the returned test-only cache result's bytes
with Array.from too, so the unchanged parity assertion still checks full text and every byte.
Cache read counts, repeated text reuse, prefix separation and existing copy assertions remain
unchanged; no production byte constructor or cache behavior changed.

tests changed: src/data/live/live.test.ts: forward the five required read ports in the test-only DriveApi wrapper.
tests changed: src/data/drive/drive-contract.ts: require restrictToMyDrive on changes.list only, per the cited docs.
tests changed: src/data/drive/drive-contract.ts: normalize proven cross-realm bytes in both assertions and cache parity output; retain exact length and content.

Baseline evidence: `tmp-logs/b1b-redfix2-before-tsc-app.log` (app tsc exit 2, TS2739).
removed: temporary byte-realm diagnostic instrumentation only; no tests removed.
left out: product code, pnpm check, e2e and commits; this assignment requests targeted red repair gates only.

Final verification (all exit 0):

- `pnpm exec vitest run src/data/drive src/data/vault src/data/live --maxWorkers=2 > tmp-logs/b1b-redfix2.log 2>&1`:
  22 files, 805 tests pass, including all B1b reds and existing Drive-call tests.
- `pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/b1b-redfix2-tsc-app.log 2>&1`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/b1b-redfix2-tsc-node.log 2>&1`.
- `pnpm exec eslint src/data/drive/drive-contract.ts src/data/live/live.test.ts > tmp-logs/b1b-redfix2-eslint.log 2>&1`.
- `git diff --check`: pass. Only the two test files and this notes file are modified;
  untracked tmp-logs contains local verification output.

## Fix round 1 reds

Red session for adversarial findings 1 and 2 (TL-P4-29/31). Added exactly two tests to the
existing `B1b HTTP and fake port parity` suite in `src/data/drive/parity.test.ts`:

- `b1b fix 1 finding 1: inherited Bin status in prefix and feed`:
  Bower → Projects → Plan.md is readable on both adapters before Projects is binned.
  An unrelated Control.md remains readable before and after the Bin operation. After the
  child is touched, the recorded HTTP change has `trashed: true` and HTTP readPrefix rejects
  with `code: not-found`. Two soft assertions expose both fake defects in the same red:
  its child change omits `trashed`, and its prefix resolves to `A short note.` instead of rejecting.
- `b1b fix 1 finding 2: Workspace change has the public HTTP shape`:
  a touched ordinary note is the positive feed-shape control; both adapters exclude a restored
  Workspace document from prefix reads. After touching the document, the exact public file
  equality fails solely because fake metadata includes `mimeType: application/vnd.google-apps.document`.
  HTTP metadata has no `mimeType` property.

Fixtures use made-up IDs/text, restored fake storage, an injected fixed clock, zero latency,
zero retry backoff and the suite's existing fake timers. The real DriveHttp consumes a test-local
recorded transport; inherited trash and MIME metadata are explicit wire fixtures independent
of fake normalization. Only modifiedTime is synchronized from the backing fake to match versions.
No network or real timers were used. No existing assertion or test body changed.

Research basis: the review's locally supplied Drive files-resource reference documents inherited
trash; the existing HTTP `toFile` normalizer defines the public file shape. No online verification
was performed, per the no-network instruction. References:

- https://developers.google.com/workspace/drive/api/reference/rest/v3/files
- https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list

Verification:

- `pnpm exec vitest run src/data/drive --maxWorkers=2 > tmp-logs/b1b-fr1-red.log 2>&1`:
  exit 1, exactly **2 failed tests and 277 passed**; three assertion failures reproduce the
  reasons above. Both tests' positive controls pass, including HTTP not-found and trashed feed.
  No import error, unrelated failure or unhandled error was reported.
- `pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/b1b-fr1-tsc.log 2>&1`: exit 0.
  Initial fixture typing errors were corrected before final verification; the final log is clean.
- `pnpm exec eslint src/data/drive/parity.test.ts > tmp-logs/b1b-fr1-eslint.log 2>&1`: exit 0.
- `git diff --check`: pass (read-only).

removed: none.
tests changed: none; two new parity tests and their recorded fixture only.
left out: production fixes, pnpm check, e2e and commits; this assignment is red-only, coordinator commits.
No git command that writes was run. Only parity.test.ts and this notes file changed.

## Fix round 1 implementation

Implemented adversarial findings 1 and 2 in `src/data/drive/fake-drive.ts` only.
No test was changed. No network request or git write command was run; the coordinator commits.

The existing `listed` metadata mechanism now derives inherited Bin status from stored parents,
visiting each id once to stop cycles and checking every parent path. Only the public metadata
is derived: the explicit stored Bin flags stay intact for untrash and snapshot restoration.
Both existing feed producers (`touch` and `changed`) already use `listed`, so child changes
now carry inherited `trashed: true`. Prefix reads check that same metadata before reading media
and reject with the existing not-found BowerError. The unrelated live control remains readable.

Every fake feed file, including a scripted page's file, now passes through the existing HTTP
`toFile` normalizer. Fake folder, numeric size and SHA-256 fields are supplied in wire form;
parents and appProperties are copied before normalization. The normalizer defines the public
field set, so private MIME metadata remains stored for Workspace prefix exclusion and snapshots,
but is absent from change files. No second public-file normalizer, feed producer or transport
was introduced. `drive-api.ts` and `drive-http.ts` are unchanged.

removed: src/data/drive/fake-drive.ts: explicit-only Bin status in listed metadata; derive inherited status there.
removed: src/data/drive/fake-drive.ts: unnormalized feed-file copy; reuse HTTP toFile for every returned change file.
tests changed: none.

Reproduced the unchanged reds before product edits:
`pnpm exec vitest run src/data/drive/parity.test.ts -t 'b1b fix 1 finding' --maxWorkers=2`
exited 1 with exactly two failing tests and three assertion failures, in
`tmp-logs/b1b-fr1-impl-red.log`:

- `b1b fix 1 finding 1: inherited Bin status in prefix and feed`: missing child trashed flag
  and prefix resolved instead of rejecting.
- `b1b fix 1 finding 2: Workspace change has the public HTTP shape`: extra private mimeType.

Final verification, after all product edits (all exit 0; output redirected, only failures and
aggregate test counts inspected):

- `pnpm exec vitest run src/data/drive src/data/vault src/data/live --maxWorkers=2 > tmp-logs/b1b-fr1-impl.log 2>&1`:
  22 files and 807 tests passed, including both exact fix-round reds and existing Drive-call tests.
- `pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/b1b-fr1-impl-tsc-app.log 2>&1`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/b1b-fr1-impl-tsc-node.log 2>&1`.
- `pnpm exec eslint src/data/drive/fake-drive.ts > tmp-logs/b1b-fr1-impl-eslint.log 2>&1`.
- `git diff --check`: passed, read-only; no test diff.

Research reused the locally supplied files-resource and changes.list references from the reds
and adversarial review, and inspected the existing HTTP `toFile` implementation. No fresh
online verification is claimed, following the no-network instruction:

- https://developers.google.com/workspace/drive/api/reference/rest/v3/files
- https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list

left out: pnpm check and e2e for integration; this fix round ran the requested targeted gates and has no UI.
left out: retrieval state, cursor persistence, indexing, contracts, other fake APIs and commits.

## Red repair 3: the fake import

The dependency gate reproduced the reported red before edits: exit 1,
`production-imports-no-fake-or-demo: src/data/drive/drive-contract.ts → src/data/drive/fake-drive.ts`.
Evidence: `tmp-logs/b1b-depcruise-red.log`.

Research stayed local, following the no-network instruction. Read-only
`git show claude/p3:src/data/drive/drive-contract.ts` confirms the existing
`describeDriveContract(name, make)` pattern: test files build adapters and inject their factory.
The B1 suite now uses that same pattern. Each of fake-drive.test.ts, drive-http.test.ts and
parity.test.ts supplies FakeDrive.restore and DriveHttp construction from the test file.
The shared recorded fixture still owns its snapshot, transport answers and positive controls;
its adapter constructors are injected. Its options type describes only the fixture inputs,
and its backing port extends DriveApi only with the existing setTimes fixture operation.
There is no fake-drive import, including type imports, in drive-contract.ts.

Every B1 case, name, assertion, bound, fixture value and positive control is preserved.
A read-only comparison against HEAD verified every assertion, test-name and suite-name line
in all four touched TypeScript files is identical. No dependency rule was changed.

tests changed: src/data/drive/drive-contract.ts: inject adapter factories and the B1 suite factory; assertions unchanged.
tests changed: src/data/drive/fake-drive.test.ts: construct adapters in the test file and pass the fixture factory.
tests changed: src/data/drive/drive-http.test.ts: construct adapters in the test file and pass the fixture factory.
tests changed: src/data/drive/parity.test.ts: supply adapter factories through its local fixture wrapper; cases unchanged.

Requested checks all exited 0; output was redirected and inspected only for failures:

- `pnpm exec vitest run src/data/drive --maxWorkers=2 > tmp-logs/b1b-redfix3.log 2>&1`: 279 tests passed.
- `pnpm exec depcruise src --config .dependency-cruiser.cjs > tmp-logs/b1b-depcruise.log 2>&1`: passed.
- `pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/b1b-redfix3-tsc.log 2>&1`: passed.
- `pnpm exec eslint src/data/drive/drive-contract.ts src/data/drive/drive-http.test.ts src/data/drive/fake-drive.test.ts src/data/drive/parity.test.ts > tmp-logs/b1b-redfix3-eslint.log 2>&1`: passed.
- `git diff --check`: passed (read-only).

removed: src/data/drive/drive-contract.ts: fake-drive import and concrete adapter construction.
left out: full pnpm check and e2e; requested targeted red repair checks only, no screen changes.
No production adapter was changed. No network or git write command was run. The coordinator commits.
