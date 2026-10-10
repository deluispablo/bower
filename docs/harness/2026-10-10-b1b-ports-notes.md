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
