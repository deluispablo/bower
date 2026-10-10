# upload-sign-out-forget red delivery

implementer: codex

Red-owning session only. Base HEAD: `e910ddce7269718976aadbd67afd9f22643e5788`.
The coordinator owns commits. No production changes, existing assertion edits, network calls or git-writing commands.

## Reds

Every exact test name in `src/data/upload-sign-out.test.ts`:

1. `upload-sign-out-forget: upload forget cannot be undone by an in-flight device add`
2. `upload-sign-out-forget: purge every folder and keep journal lines (accepted sign-out)`
3. `upload-sign-out-forget: purge every folder and keep journal lines (failed remote sign-out)`
4. `upload-sign-out-forget: purge every folder and keep journal lines (auth expiry)`
5. `upload-sign-out-forget: a failed local upload purge reports a BowerError and logs its cause`

The first two preparation rows are covered by red 1 and reds 2–4 respectively. Red 5 pins the packet's
explicit local-purge-error contract. No new count API signature is invented: the packet's Reds section
does not specify a count entry point. That API and the Settings sheet belong to the later implementation/UI work.

### Assertion evidence at HEAD

- Red 1: `fast-check` seed 53029, path `1`, counterexample `[2,false]`. Two staged adds commit after
  `forgetAccount` clears the account. Both their metadata and their original 10-byte bodies return.
  The assertion expects no records and two null bodies from a fresh IndexedDB-backed store.
  This is an underlying failed `expect`, wrapped by fast-check, not a module/import failure.
- Reds 2–4: the account's records in both roots and both original bodies remain after accepted sign-out,
  failed remote sign-out, or an auth refusal through `vault.tree`/the production auth watcher.
  The assertion expects two empty folder listings and two null bodies. The other account and both
  folder outboxes are checked before this failing assertion and survive byte-identically.
- Red 5: injecting failure into the actual store's `clear` leaves `session.signOut` returning
  `{ value: undefined }`. The assertion expects a `BowerError` with
  `Signing out did not finish. Try again.`; the test also requires the original cause in `console.error`.

### Positive controls and production paths

- Red 1 calls the real queue's `start`, `add`, `discard` and `forgetAccount` over fake IndexedDB.
  Before each generated interleaving, committed metadata and bytes are observed, then discard and
  ordinary forget really remove them while another account's metadata and bytes remain unchanged.
  The explicit `[2,true]` example (commit before forget, delayed add completion) passes at HEAD before
  `[2,false]` fails. The property generates 2–4 members and both commitment interleavings, 12 trials
  after fixes, with a fixed seed and no shrinking (`endOnFailure`). No numeric contract was loosened.
- Reds 2–5 use `makeLiveSources`, `FakeWorker`, `FakeDrive`, the real upload queue and
  `indexedDbUploadStore(new IDBFactory())`. Synthetic account A has an upload in each of two actual
  roots, with the corresponding Inbox as its destination; account B has its own scoped upload.
  Every initial body is read back exactly. Ordinary `sources.dispose` preserves metadata, bodies and
  folder outboxes, establishing the disposal/sign-out distinction before each red.
- A real transfer is held by `FakeDrive.beforeChunk` at offset 4, after the device confirms four bytes.
  Sign-out or auth expiry then stops it; releasing the barrier and awaiting queue idle precedes storage
  assertions, so late transfer work is included. Restart assertions require no A upload traffic in
  either root; B's retained upload is the positive transport control and must finish once.
- Red 5 first uses the unmodified queue to forget account B and verifies both metadata and bytes go,
  then injects a synthetic failure into account A's actual store `clear`. The queue is not mocked.
- Namespace imports and `requiredExport` turn a missing entry-point export into a failed `expect`.
  Queue, FakeDrive and FakeRunService clocks are injected. Barriers use promises; no real-time waits,
  sleeps, polling timers or test timeout overrides were added. Held transfers are released in `finally`.

## Existing assertions preserved: TL-P4-51 conflicts

No existing assertion was edited or deleted. The following existing expectations contradict
TL-P4-53 Q1's failed-remote-sign-out local-forgetting ruling, in the existing test
`failed remote logout retains bytes and metadata until the successful retry`:

- `src/data/live/live.test.ts:1695`: `getDraft('LIVE_DRAFT_A')` still equals the selected Blob.
- `src/data/live/live.test.ts:1695`: `getDraft('LIVE_ORPHAN_A')` still equals the orphan Blob.
- `src/data/live/live.test.ts:1696`: each person-local value remains `'[]'`: `bower:seen`,
  `bower:dismissed`, `bower:run-seen`, `bower:bookmarks`, `bower:open`, `bower:stopped-away`,
  `bower:failed-lines` (the key set is defined at line 1636).
- `src/data/live/live.test.ts:1697`: each person-session value remains non-null: `bower:add-draft`,
  `bower:add-items`, `bower:toured`, `bower:tabs` (the key set is defined at line 1637).

The same test's rejection, goodbye-marker, preferences, outbox and successful-retry assertions do
not contradict this ruling. The existing failed-sign-out lifecycle retry at line 564 likewise does
not contradict local forgetting: the remote rejection can still be reported. Queue/store regression
assertions distinguish `stop`/ordinary disposal from `forgetAccount`; they were left intact.
Only the new test file was executed, as expressly instructed for this red session. The coordinator/lead
must resolve the listed assertion conflicts before an implementation can satisfy all existing tests.

tests changed: none (all existing test files and assertions preserved)
removed: none

## Verification

- `pnpm exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2`:
  exit 1, five tests, five intended assertion failures, no load errors or timer-gate failures.
  Final output: `tmp-logs/upload-sign-out-red.log`. Only failure sections and aggregate results read.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: pass; `tmp-logs/upload-sign-out-tsc-app.log`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit`: pass; `tmp-logs/upload-sign-out-tsc-node.log`.
- `pnpm exec eslint src/data/upload-sign-out.test.ts`: pass; `tmp-logs/upload-sign-out-eslint.log`.
- No full suite, `pnpm check`, e2e, server, fix, commit or integration: this assignment is red-only.

## Research

No network. These are inherited official references, not fetched or re-verified during this session:

- Google Drive resumable uploads:
  <https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable>.
  Retain the session URI, query status with `Content-Range: bytes */N`, interpret 308/server Range,
  and handle temporary-session expiry. The preparation records the local adapter/protocol evidence.
- IndexedDB transaction lifecycle:
  <https://www.w3.org/TR/IndexedDB/#transaction-lifecycle>.
  Transaction completion is the committed device-store boundary, rather than queue/UI progress;
  subsequent transactions may still add data after a clear unless application lifetime fencing
  prevents resurrection. Existing `upload-store.ts` commits pending metadata and bytes together and
  clears both stores; the red reuses that implementation through fake IndexedDB.

Reuse evidence: the preparation's Standard solution section and the provenance in
`src/data/upload-queue.ts` / `src/data/upload-store.ts`. No files outside this worktree were read.

## Red repair 1 (sweep)

This authorized round supersedes the earlier retention-conflict section and its `tests changed: none`.
Only the two contradictory existing tests and this required notes record were edited. No production
file, network call or git-writing command was used; the coordinator owns commits.

### Assertions converted

tests changed: src/data/live/live.test.ts:1691: TL-P4-53 Q1: failed remote logout forgets locally before retry; rename the retention test.
tests changed: src/data/live/live.test.ts:1696: TL-P4-53 Q1: selected and orphan pending draft bodies are absent immediately after remote failure.
tests changed: src/data/live/live.test.ts:1697: TL-P4-53 Q1: person-local metadata is forgotten immediately rather than retained as empty arrays.
tests changed: src/data/live/live.test.ts:1698: TL-P4-53 Q1: person-session metadata is forgotten immediately rather than retained until retry.
tests changed: src/data/vault/drive-vault.test.ts:1460: TL-P4-53 Q1: replace the accepted-sign-out retention scenario with forgetting through actual LiveSources sign-out.
tests changed: src/data/vault/drive-vault.test.ts:1477: TL-P4-53 Q1: the signed-out account has no stored pending metadata or body, rather than one retained record.
tests changed: src/data/vault/drive-vault.test.ts:1492: TL-P4-53 Q1: reopening that account sends nothing and creates no completed scan, rather than resuming forgotten bytes.

The live test retains its offline rejection and pins today's exact message,
`Signing out did not finish. Try again.`. An added assertion confirms Alex is still signed in after
that rejection. Goodbye-marker, preferences, folder outbox and successful retry assertions remain.
The vault test retains all other-account isolation assertions. Its old `stop()` scenario was only a
page-disposal simulation: it now invokes the real `live.session.signOut()` with the real queue/store
and derives the actual account hash, so ordinary disposal is not incorrectly required to purge.
Initial store reads establish real committed metadata and bytes. The held transfer is released and
awaited before purge assertions; `finally` releases the hold and clears the fake Worker's tab session
so this newly real sign-out does not affect the next test. Removed the obsolete retention comment.
No assertion unrelated to sign-out retention was removed or weakened.

### TL-P4-51 sweep

Searched active test files under `src`, `e2e`, `api/test` and `runner/test`, excluding archived
harness evidence. Repeated the sign-out/logout/forget search over TypeScript printer output with
`removeComments: true`: 278 test files, evidence `tmp-logs/upload-sign-out-red-repair-1-sweep.txt`.
Reviewed upload-queue, upload-queue-real, upload-store, live and device cleanup test contexts.
The only additional retention-through-sign-out test was `drive-vault.test.ts:1460`, now converted.
There is no standalone device test file: device cleanup coverage is in
`src/features/piles/draft-files.test.ts` and `src/app/ui-store.test.ts`.
Queue `stop`, ordinary reload/disposal, account/folder isolation without sign-out, failed upload,
expiry of a resumable session and store-scoping tests are not sign-out retention promises and stay.
Journal outbox retention and the failed remote sign-out session/lease lifecycle stay as required.
No remaining active test asserts that pending upload bytes or metadata survive sign-out.

### Verification

Command (all eight targeted files, including both touched files):

```sh
pnpm exec vitest run src/data/live/live.test.ts src/data/vault/drive-vault.test.ts src/data/upload-queue.test.ts src/data/upload-queue-real.test.ts src/data/upload-store.test.ts src/data/upload-sign-out.test.ts src/features/piles/draft-files.test.ts src/app/ui-store.test.ts --maxWorkers=2
```

- Final run: exit 1; 404 tests, 397 pass, seven intended assertion failures; three failing files,
  five passing files. Output: `tmp-logs/upload-sign-out-red-repair-1.log`.
- Newly repaired red `failed remote logout forgets bytes and metadata before the successful retry`:
  `live.test.ts:1696` expects undefined but receives the retained Blob. Exact rejection and
  still-signed-in assertions pass before this red.
- Newly repaired red `sign-out forgets the bytes for that account and folder; another account never sees or sends them`:
  `drive-vault.test.ts:1477` expects an empty list but receives the 10-byte record confirmed at four bytes.
- The original five `upload-sign-out.test.ts` reds still fail on their same intended assertions
  (late add resurrection; accepted sign-out; failed remote sign-out; auth expiry; silent purge failure).
- No remaining contradictory test, load failure, unhandled failure or timer-gate failure.
- First execution exposed fake-Worker tab-session leakage from the newly real vault sign-out into
  the next account-deletion test. Added test-owned `finally` cleanup and reran the targeted suite;
  that unchanged account-deletion test now passes. No production fix was made.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: pass after the final test edit;
  `tmp-logs/upload-sign-out-red-repair-1-tsc-app.log`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit`: pass;
  `tmp-logs/upload-sign-out-red-repair-1-tsc-node.log` (node inputs unchanged afterward).
- `pnpm exec eslint src/data/live/live.test.ts src/data/vault/drive-vault.test.ts`: pass after final edit;
  `tmp-logs/upload-sign-out-red-repair-1-eslint.log`.
- No `pnpm check`, e2e, server, implementation fix or commit: this assignment is one test-only red repair.
- Research remains the inherited official Drive and IndexedDB references in the Research section;
  no network or new dependency, and the existing live/queue/store/fake stack is reused.

removed: obsolete vault-test comment promising device retention through sign-out; no tests removed.
