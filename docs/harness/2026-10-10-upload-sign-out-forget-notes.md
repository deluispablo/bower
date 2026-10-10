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


## Implementation

This session implements the committed reds and red repair 1 under TL-P4-53 Q1 and addendum 1.
Only the three owned production files and this notes file are changed. No test changes or
Git-writing commands were made by this session; harness/codex-run.sh owns the commits.

### Research and reuse

No external reference was fetched. The inherited official references were checked against the
existing local adapters before the fix:

- [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
  keep the session URI, ask status with `Content-Range: bytes */N`, interpret 308 with the server's
  confirmed range, and reopen an expired session with the same reserved file identity.
  Local evidence: `src/data/drive/drive-http.ts` openResumable/sessionStatus/sessionAnswer and
  `src/data/drive/resumable-upload.ts` open/status/restart loop. This entry changes none of that protocol.
- [IndexedDB transaction lifecycle](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle):
  a transaction's completion commits its changes; clearing earlier cannot cancel an application
  operation that starts its add transaction later. Existing upload-store.add commits metadata and
  bytes together, upload-store.save cannot recreate a removed record, and clear removes both stores
  under the account prefix. The existing queue lifetime fence now covers byte staging too.
- [Noble hashes](https://github.com/paulmillr/noble-hashes): the existing digest home exposes
  sha256Sync for small fingerprints. uploadAccount retains its Promise API and identical normalized
  UTF-8 SHA-256 value while using that helper. No second digest implementation or dependency is added.

The first requested pnpm command unexpectedly auto-installed because this worktree's dependencies
were incomplete. Its registry requests failed DNS resolution; the process was stopped. An attempted
environment-only offline setting was ignored by pnpm 12 and was also stopped. Subsequent commands
use a local pnpm shim with explicit `--config.verifyDepsBeforeRun=false --config.offline=true`.
Dependencies were copied from the already installed local app checkout; no dependency manifest or
lockfile was changed. No successful external network request occurred. The local shim is evidence
only and is removed from the worktree with tmp-logs at delivery.

### Change

- The existing live auth watcher remembers the accepted account hash in memory and awaits expiry
  cleanup. Session sign-out runs the existing device.ts forgetThisPerson path and queue.forgetAccount
  in finally, including when the Worker rejects logout. The remote error still reaches the caller;
  failed remote logout still leaves the remote session available for its existing retry.
- Expiry uses the same forget helper. Invalidation immediately stops/fences the queue. Ordinary
  dispose and stop keep device records. No journal outbox key or Drive record is removed.
- Queue forgetAccount increments an account-scoped fence before stopping and clearing every folder.
  New staging and reselection share keepBytes: a delayed add from a forgotten lifetime removes its
  committed metadata and bytes before returning. Ordinary page disposal does not increment that fence.
  Existing progress saves update only present records, so a held transfer cannot recreate a cleared one.
- A refused clear logs its original cause and rejects with the pinned BowerError sentence,
  `Signing out did not finish. Try again.`. An expiry purge error survives the stable door's stale-call
  check rather than being replaced by a session-conflict error.
- The real queue always exposes pendingCount(): waiting plus uploading entries in this page's
  current queue. hasUnfinished uses that same count. No count table, persisted copy, Settings logic,
  or extra store query is added. The interface makes the method optional only for existing injected
  queue ports, whose frozen test fixtures predate the new API; the real factory always supplies it.

removed: src/data/upload-queue.ts: old sign-out retention promises and duplicate hasUnfinished predicate.
removed: src/data/upload-store.ts: old header promise that pending bytes survive sign-out.
removed: src/data/live/index.ts: old invalidation comment promising retained uploads for a signed-out person.
removed: no production mechanism, test, stored-format field, journal line or Drive file was removed.
tests changed: none

### Verification

All command output was written under tmp-logs and only failures and aggregate results were read.
The explicit offline pnpm settings apply to the commands below; check and e2e use the shared heavy lock.

- Baseline reds, before the fix: `pnpm exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2`:
  5 intended assertion failures. The late-add property fails at seed 53029, path 1, `[2,false]`;
  the three lifecycle reds retain account A uploads; the purge-failure red returns silent success.
- Final reds and full live file: `pnpm exec vitest run src/data/live/live.test.ts src/data/upload-sign-out.test.ts --maxWorkers=2`:
  pass, 107/107. All five exact red names remain those listed in the Reds section above.
- Final requested whole suite: `pnpm exec vitest run src/data --maxWorkers=2`: pass, 79 files, 4,165/4,165 tests.
- Final `pnpm exec tsc -p tsconfig.app.json --noEmit`: pass.
- Final `pnpm exec tsc -p tsconfig.node.json --noEmit`: pass.
- Final `pnpm exec eslint src/data/live/index.ts src/data/upload-queue.ts src/data/upload-store.ts`: pass.
- `git diff --check`: pass; Git was used only for status, diff and reading HEAD versions for baseline reds.

During implementation the first data run failed the older-ask run-status assertion at
src/data/live/live.test.ts:1146. Waiting for account hashing inside the identity read changed the
request order; the fix preserves that read's timing. The next live run found auth diagnostic timing
at src/data/live/live.test.ts:1464; using the existing synchronous digest helper resolved it.
Both unchanged tests pass in the final full data suite. No remaining test contradicts the packet
or Q1. No test was weakened, deleted, skipped or singled out with .only.

### Full gates and delivery boundary

- Final `pnpm check`: exit 1. App lint/typecheck finish; 165 app test files pass,
  5,510/5,511 tests pass. The sole failure is
  `src/e2e-port.test.ts:37`, `a server from another worktree is never reused`:
  its local listener is refused with `listen EPERM` on 127.0.0.1, then the unchanged test times out.
  One unhandled listener error has that same cause. Later check stages do not run after the failed
  app-unit stage. The earlier check also captured the subsequently corrected auth-timing regression;
  that unchanged test passes in the final check. No green check mark is claimed.
- Demo: `bash harness/with-lock.sh pnpm exec playwright test e2e/app.spec.ts`: exit 1,
  before any phone/desktop test executes. Vite cannot listen on ::1:6042 (`EPERM`).
- Fake: `E2E_SOURCE=fake bash harness/with-lock.sh pnpm exec playwright test e2e/app.spec.ts`:
  exit 1 before any test executes, with the same local-listener refusal.
- These are environment restrictions, not packet/ruling contradictions. The entire requested data
  suite was run and is green. Contradicting tests in that suite: none. No permission bypass,
  alternate lock, weakened server test or unrelated code fix was attempted.
- Delivery remains blocked on the full check and demo/fake browser gates in a socket-permitted
  environment. The implementation remains in this worktree for the harness to commit/review.
  The later Sign out now? sheet and the designer's close verification are outside this assignment.

removed: 20 original production lines replaced (live/index.ts 10; upload-queue.ts 9; upload-store.ts 1).
tests changed: none

Evidence: `/private/tmp/upload-forget-evidence/`. Log files were retained there after all commands
finished; tmp-logs, its offline shim, and its temporary baseline copies were deleted from the worktree.
Final logs: upload-sign-out-red.log, upload-sign-out-live-green-3.log,
upload-sign-out-data-final.log, upload-sign-out-tsc-app-final.log,
upload-sign-out-tsc-node-final.log, upload-sign-out-eslint-final.log,
upload-sign-out-check-final.log, upload-sign-out-e2e-demo.log, upload-sign-out-e2e-fake.log.

tests changed: src/data/live/live.test.ts: red repair 1 (TL-P4-53 Q1): a failed remote sign-out forgets pending uploads locally; nothing retains them until a retry.
tests changed: src/data/vault/drive-vault.test.ts: red repair 1 (TL-P4-53 Q1): pending uploads do not survive sign-out.

## Fix round 1 reds

Red-owning session for TL-P4-29; adversarial review BLOCK 2. Production remains at
HEAD `2952d5021d9e5a16f68495d61625574accd73b06`. No network or Git-writing command.
The coordinator owns commits. Only the test file and this requested notes record changed.

tests changed: src/data/upload-sign-out.test.ts: append two finding regressions, their positive controls and direct pendingCount coverage; every existing assertion and bound stays byte-identical.
removed: none

Exact added test names:

- `upload-sign-out-forget: fix 1.1: cross-tab staging cannot restore forgotten bytes (sign-out)`
- `upload-sign-out-forget: fix 1.1: cross-tab staging cannot restore forgotten bytes (auth expiry)`
- `upload-sign-out-forget: fix 1.2: sign-out waits for staging cleanup and reports a late remove failure (remove fails: false)`
- `upload-sign-out-forget: fix 1.2: sign-out waits for staging cleanup and reports a late remove failure (remove fails: true)`
- `upload-sign-out-forget: fix 1.3: pendingCount counts waiting and uploading things on this device`

Each finding uses two real upload queues with separate real store connections sharing one
fake IndexedDB factory. Sign-out goes through LiveSources.session.signOut(); auth expiry
uses the production watcher after an auth refusal from LiveSources.vault.tree().
The staging barrier delays the actual Blob.arrayBuffer inside the real IndexedDB store.add,
rather than replacing staging with a queue mock. Its original body is exactly 15 bytes.
The clear barrier signals only after the real account-clear transaction commits. Both queues'
idle promises and the add/ending outcomes settle before the final cross-tab storage read.
Every held barrier is released in finally; no real timers, polling or sleeps.

Finding 1's positive control commits tab B's original 10-byte body first, observes it through
tab A's connection, and verifies that tab A's real sign-out/expiry deletes its metadata and
bytes before releasing B's staged 15-byte Blob read. At HEAD both lifecycle cases then fail
the intended storage assertion: one record and all 15 original bytes return, instead of an
empty list and null body. The expected successful sign-out/auth error already passed.

Finding 2 stages on tab A to isolate its existing fence and late cleanup from finding 1's
missing cross-tab fence; tab B supplies independently committed bytes for the purge control.
The delayed remove barrier holds actual cleanup after the staged write commits. Its successful
positive-control case runs the same sequence with the real remove and passes: no record or
bytes remain. Its failure case throws a synthetic cause from remove after the successful clear.
The test pins a BowerError with the exact existing short sentence and the cause in console.error,
plus non-completion during both staging and cleanup. At HEAD the intended error assertion
fails: sign-out returns `{ value: undefined }` despite the observed retained record and 15 bytes.
The test never requires success to be reported before releasing a barrier, so a correct waiting
implementation can complete this sequence.

The count test directly calls the real pendingCount method and pins 0 before starting, 1 while
uploading, 2 with another waiting item, 1 after discarding that waiting item, and 0 once done.
It additionally pins an offline waiting item at 1, a failed retry at 0, and stop at 0. The done
item remains visible while excluded from the count. All these count assertions pass at HEAD.

Final verification (explicit offline pnpm configuration prevents dependency auto-install):

- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2`:
  exit 1; 10 tests, 7 pass, exactly the three intended finding assertions fail. All five existing
  tests pass unchanged, along with the successful-cleanup control and count test. No load error,
  unhandled failure or timer-gate failure. Final failure lines: test file 369 (both lifecycle cases)
  and 426 (late remove failure).
- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec tsc -p tsconfig.app.json --noEmit`: pass.
- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec eslint src/data/upload-sign-out.test.ts`: pass.
- Compared the HEAD test-file bytes to the final file: the entire old file remains an unchanged prefix.
- No full check/e2e, server, production edit, fix or commit: this assignment is test-only red delivery.

An initial count-test draft mistakenly expected offline to be a terminal error; local inspection
showed the existing queue keeps it waiting. The final new test pins that behavior and separately
uses an unknown error for the failed state. No committed assertion or bound changed.
Research uses the inherited official IndexedDB transaction-lifecycle and Drive resumable-upload
references above; nothing was fetched. Existing queue/store/live/fake mechanisms were reused.

Output was written to tmp-logs; final logs were copied to
`/private/tmp/upload-sign-out-fix-1-evidence/` and tmp-logs was deleted before delivery.
Evidence: upload-sign-out-fix-1-red.log, upload-sign-out-fix-1-tsc.log,
upload-sign-out-fix-1-eslint.log. No temporary test artifacts remain in the worktree.

## Fix round 1

Implementation session stopped under the owner's TL-P4-51 instruction after running the whole
targeted data suite and finding the following contract contradiction. No production file or test
was edited; no network request, Git-writing command, dependency install or new store was used.

### Every contradictory test (file:line)

- `src/data/upload-sign-out.test.ts:126`, test declared at line 71:
  `upload-sign-out-forget: upload forget cannot be undone by an in-flight device add`.
  Its injected store.add waits on release.promise at line 115. The test awaits forgetAccount at
  line 126 and opens that release only in the following finally at line 127. Both explicit
  examples at line 139, `[2,true]` and `[2,false]`, therefore require forgetting to return with
  its staging/cleanup operation outstanding. If forgetting awaits that operation as required
  in this round, forget waits for staging, staging waits for release, and release waits for
  forget: the test deadlocks. In the true case the store write has committed but queue cleanup
  is still outstanding; in the false case both the write and cleanup are still outstanding.
  Neither case can be satisfied by awaiting the account's staging and cleanup without changing
  the test's barrier ordering. The owner forbids every test change in this session.

This is the complete contradiction list found after searching the targeted data tests for
forgetAccount, signOut, forgetting, purge and logout and inspecting the queue/store and live
cleanup cases. Ordinary transfer barriers are not staging barriers. The fix 1.2 assertions at
lines 412–413 require a temporary late record while sign-out is still pending; they constrain
a transactional-marker implementation but do not independently contradict the required
post-sign-out fence, since awaited cleanup can remove that record before sign-out settles.
No additional contradictory test was found in the whole requested suite.

The full data suite still reproduces both adversarial findings. A shared store transaction fence
and awaited queue cleanup remain unimplemented pending the lead's resolution of the barrier
contract above. No timeout, skip, changed assertion, test-specific bypass or altered numeric
bound was introduced. The sign-out/auth-expiry, ordinary-disposal and journal contracts remain
as committed.

### Verification

All output was redirected under tmp-logs; only failures and aggregate results were read.
Explicit offline pnpm configuration prevented dependency auto-install.

- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2`:
  exit 1; 10 tests, seven pass, three intended finding assertion failures. Exact failing names:
  `upload-sign-out-forget: fix 1.1: cross-tab staging cannot restore forgotten bytes (sign-out)`;
  `upload-sign-out-forget: fix 1.1: cross-tab staging cannot restore forgotten bytes (auth expiry)`;
  `upload-sign-out-forget: fix 1.2: sign-out waits for staging cleanup and reports a late remove failure (remove fails: true)`.
  Both cross-tab cases fail at line 369; the cleanup-failure case fails at line 426.
- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec vitest run src/data --maxWorkers=2`:
  exit 1; 79 files, 78 pass; 4,170 tests, 4,167 pass. Only the same three assertions fail.
  No load error, unhandled failure or additional failure. The contradictory test currently
  passes because the existing forgetAccount does not await staging; its deadlock follows from
  the committed barrier ordering, not from a baseline failure or a modified test.
- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec tsc -p tsconfig.app.json --noEmit`: pass.
- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec tsc -p tsconfig.node.json --noEmit`: pass.
- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec eslint src/data/upload-queue.ts src/data/upload-store.ts`: pass.
  These are the inspected production files; the only touched file is this Markdown notes file.
- No check/e2e, server, implementation edit or commit after the required contradiction stop.

Research: the inherited official IndexedDB transaction-lifecycle and Drive resumable-upload
references in the Research section above, checked against the existing store/queue code only.
Nothing was fetched. Transaction completion and application staging completion are distinct;
the existing store stages the Blob before starting its write transaction.

removed: none (0 production lines; 0 test lines)
tests changed: none

Evidence: `/private/tmp/upload-sign-out-fix-round-1-implementation-evidence/`.
Logs: fix-round-1-red.log, fix-round-1-data.log, fix-round-1-tsc-app.log,
fix-round-1-tsc-node.log, fix-round-1-eslint.log. tmp-logs deleted before delivery.

## Fix round 1 red repair

tests changed: src/data/upload-sign-out.test.ts: pass 1 finding 2: release staging while sign-out is pending, since forgetting now awaits it

Only the barrier ordering and its comment changed; every assertion, both explicit examples
([2, true], [2, false]), and every other test remain unchanged.
Offline verification: `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2`
exited 1: seven passed, three existing finding assertions failed (both fix 1.1 cases at line 371,
fix 1.2 remove-fails case at line 428). The repaired property test passed without a timeout.
No production edits, network, Git writes, check or e2e. Research inherited from the existing
IndexedDB transaction-lifecycle reference above; no new mechanism introduced.
Evidence: `/private/tmp/upload-sign-out-red-repair-evidence/red-repair.log`.
Output was redirected to tmp-logs and that directory was deleted before delivery.


## Fix round 1

This fresh implementation follows the committed barrier repair and implements both pass-1
adversarial findings. Owned production homes: src/data/upload-queue.ts and
src/data/upload-store.ts. No tests, live/session code, shared harness records, dependency files,
or stored member format changed. No network, new store, new dependency or Git-writing command.
The coordinator owns commits.

### Research and design

Inherited official references, checked against local code without fetching them:

- [IndexedDB transaction lifecycle](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle):
  capture the account's forget generation before reading the Blob; check it inside the same
  read/write transaction that commits metadata and bytes. An account-wide clear increments the
  marker in its purge transaction. A transaction ordered before clear gets purged; one ordered
  after clear cannot commit an old generation from another connection.
- [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
  existing session URI, status query, 308 range and expiry behavior remain in the original adapter.
  This round changes neither transport nor reserved identity.

The account marker is a string-keyed number in the existing bytes object store. Member keys
remain arrays, so marker keys cannot collide or appear in pending listings, member body reads,
or account/folder deletion prefixes. No database upgrade or second persistence mechanism.
Absent markers read as generation zero, preserving existing version-1 records and connections.

Queue staging is tracked from add admission through reselection, room checks, the store write
and late removal. forgetAccount fences/stops immediately, snapshots this account's outstanding
adds, clears all its folders, then awaits those operations and their cleanup even if clear fails.
Cleanup failures retain their original cause for the forget caller, which logs details and throws
the existing BowerError sentence, `Signing out did not finish. Try again.`. Expected stopped-add
errors are not confused with purge failures. Store fence rejection becomes a logged BowerError
for the add; it cannot become an in-memory fallback that continues sending forgotten bytes.

The store's optional retireStaging hook matches the exact in-memory record objects whose queue
operations forgetting will await. It grants no permission to another queue sharing a connection.
That staging may finish under that connection's specific clear generation
solely for the queue's awaited removal; it cannot outlive successful forgetting. This preserves
the committed cleanup red's real late-write/removal path, including its injected refusal. Other
connections have no retirement permission and fail the shared marker check before writing.
A subsequent clear in another connection changes the generation again and rejects even a local
retired write. Direct clear callers never grant retirement. Normal storage fallback, disposal,
folder scoping, other-account bytes, journal outbox and pendingCount behavior are unchanged.

### Red evidence

Before the fix, upload-sign-out.test.ts has exactly the three reviewed assertion failures:

- fix 1.1 cross-tab staging (sign-out), at src/data/upload-sign-out.test.ts:371;
- fix 1.1 cross-tab staging (auth expiry), at src/data/upload-sign-out.test.ts:371;
- fix 1.2 staging cleanup (remove fails: true), at src/data/upload-sign-out.test.ts:428.

Both cross-tab cases restore one record and all 15 bytes after the real clear. The refused late
remove makes sign-out return success. The other seven tests pass, including the repaired property,
successful cleanup control and direct pendingCount coverage. No contradiction in these committed
reds; the previous barrier contradiction was resolved in the preceding red-only repair.

### Verification

All output is under tmp-logs; only failures and aggregate results are read. Explicit offline
pnpm configuration prevents dependency auto-install. Full packet gates use the shared lock and
an offline wrapper for nested pnpm calls. Final command results and evidence follow below.

- Baseline reds: 10 tests, seven pass, three intended assertions fail (fix-round-1-red.log).
- Final exact reds: all 10 pass (fix-round-1-reds-final.log).
- Final requested `pnpm exec vitest run src/data --maxWorkers=2`: 79 files, 4,170/4,170 pass
  (fix-round-1-data-final.log). Every committed bound and assertion remains intact.
- Final `pnpm exec tsc -p tsconfig.app.json --noEmit`: pass (fix-round-1-tsc-app-final.log).
- `pnpm exec tsc -p tsconfig.node.json --noEmit`: pass (fix-round-1-tsc-node.log).
- Final eslint on src/data/upload-queue.ts and src/data/upload-store.ts: pass
  (fix-round-1-eslint-final.log).
- The full check's first run finds two syntax-scanner catch failures at upload-queue.ts:319,957.
  Both catches defer their original cause until awaited cleanup completes, then log/reject or
  rethrow. Added `expected:` comments explaining that deferred handling; no logic or test changed.
  The architecture test and all 10 exact reds pass together afterward (fix-round-1-architecture-reds.log).
- Demo and fake packet e2e: both exit 1 before any test runs. Vite cannot listen on ::1:6042
  (`listen EPERM`), as in the prior implementation environment. No permission bypass attempted.
- Full-check final result follows below. No contradicting test in the whole requested data suite;
  the socket-dependent server test is an environment restriction, not a policy contradiction.

removed: 71 original production lines replaced/reindented (queue 63; store 8); no behavior or test removed.
removed: no store, stored member field, journal line, Drive file or test assertion removed.
tests changed: none

- Final `pnpm check`: exit 1; 166 app test files, 165 pass; 5,515/5,516 app tests pass.
  The only failed test is src/e2e-port.test.ts:37, `a server from another worktree is never reused`:
  the sandbox refuses its local listener on 127.0.0.1 (`listen EPERM`), causing its unchanged
  five-second timeout and the same unhandled listener error. Architecture and every data test
  pass. App lint/typecheck pass; subsequent check stages do not run after this app-unit failure.
  No green check mark is claimed. The full check and demo/fake e2e need a socket-permitted
  environment for entry closure; the requested fix-round tests, types and touched-file lint pass.
- Final git diff --check: pass. Test-file diff: empty. Only both owned production homes and this
  notes file are touched. Git was used only for read-only status/diff; no commit, branch switch,
  index mutation, integration or push command was issued.

Evidence: `/private/tmp/upload-sign-out-fix1-final-evidence/`.
Final logs: fix-round-1-red.log, fix-round-1-reds-final.log, fix-round-1-data-final.log,
fix-round-1-tsc-app-final.log, fix-round-1-tsc-node.log, fix-round-1-eslint-final.log,
fix-round-1-architecture-reds.log, fix-round-1-check-final.log, fix-round-1-e2e-demo.log,
fix-round-1-e2e-fake.log. Earlier diagnostic runs are retained there as well.
All commands settled before evidence was copied; tmp-logs and its offline wrapper were deleted.
Implementation is ready for independent review; full socket-dependent gates remain blocked.

tests changed: none
removed: 71 original production lines replaced/reindented; 0 test lines removed.


## Fix round 2 reds

Red-owning session for adversarial pass 2 BLOCK 1, TL-P4-29 / TL-P4-51.
Base HEAD: `95ccde3c5cb835c7f05bd5f91fe7e066ee741e3b`.
The coordinator owns commits. Only the test file and this requested notes record changed;
no production edits, network, or Git-writing commands.

tests changed: src/data/upload-sign-out.test.ts: add cross-tab pre-store.add forgetting races; inject optional storage into existing fixtures without changing any current assertion or bound.

### Exact names

- `upload-sign-out-forget: fix 2: new add storage.estimate() before sign-out`
- `upload-sign-out-forget: fix 2: new add storage.estimate() before auth expiry`
- `upload-sign-out-forget: fix 2: reselection Blob.arrayBuffer() before sign-out`
- `upload-sign-out-forget: fix 2: reselection Blob.arrayBuffer() before auth expiry`
- `upload-sign-out-forget: fix 2: reselection crypto.subtle.digest() before sign-out`
- `upload-sign-out-forget: fix 2: reselection crypto.subtle.digest() before auth expiry`
- `upload-sign-out-forget: fix 2: reselection storage.estimate() before sign-out`
- `upload-sign-out-forget: fix 2: reselection storage.estimate() before auth expiry`

### Class coverage and evidence

- Two real queues use independent IndexedDB-backed store connections sharing one `IDBFactory`.
  Tab A forgets through `LiveSources.session.signOut()` or an auth refusal through `vault.tree()`;
  tab B pauses before any `store.add` invocation. No queue or forgetting entry point is mocked.
- Audited `add`, `chosenAgain`, `fits`, `keepBytes` and the existing digest home. Fresh adds await
  `fits` / `storage.estimate()`. Reselection additionally awaits hashing, whose two real async steps
  are `Blob.arrayBuffer()` and `crypto.subtle.digest()`, then awaits the same storage estimate.
  Each of these four branch/step cases is crossed with both production endings. `storage.persist()`
  is fire-and-forget, not a pre-write await; `stageUpload` awaits the work containing these steps,
  and `keepBytes` reaches `store.add` without another pre-write await. Store-internal staging remains
  covered by the existing fix 1.1 Blob-read cases, all preserved.
- Reselection starts with the same committed 15-byte body read back exactly, then a test-owned
  unreadable-body fault drives the real queue to `gone: true`. Restore that read before reselection.
  Hash barriers keep the real Blob read/digest result. Storage reports an exact 1024-byte quota and
  zero usage. Barriers are promises, always released in `finally`; no real waits or timer overrides.
- Positive control: tab A sees tab B's committed 10-byte upload before forgetting. Once the real
  ending finishes, account listings are empty and both the control and candidate bodies are null,
  while tab B remains paused. A spy verifies that B has not yet called `store.add`.
- Only then release B, await its add and both queue drains, read metadata and both bodies, restart
  both real queues and drain/read again. Both post-forget snapshots must stay empty/null; restart
  must produce no upload traffic. Candidate identity is retained independently of a store-add spy,
  so a fix that refuses before `store.add` can still satisfy the zero-byte assertions.
- Final HEAD run: all eight new cases fail at `src/data/upload-sign-out.test.ts:589` on the intended
  assertion, with one `MEMBER_21` metadata record and its original 15-byte body in both post-forget
  snapshots. All eight passed the earlier zero-record / null-body assertion after forgetting finished.
  All ten existing tests pass. No current assertion, test name, example, trial count, seed, bound,
  tolerance or failure-injection behaviour was removed or weakened. No contradictory existing test
  surfaced in the complete requested file; no import, unhandled, or timer-gate failure in the final run.

### Verification

- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2 --config /private/tmp/upload-sign-out-fix-2-yyg0vonu/vitest.config.mjs --configLoader runner`:
  exit 1; 18 tests, eight intended assertion failures and ten passes. Log: `/private/tmp/upload-sign-out-fix-2-yyg0vonu/vitest.log`.
- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec tsc -p tsconfig.app.json --noEmit --tsBuildInfoFile /private/tmp/upload-sign-out-fix-2-yyg0vonu/app.tsbuildinfo`:
  pass; log `/private/tmp/upload-sign-out-fix-2-yyg0vonu/tsc.log`.
- `pnpm --config.verifyDepsBeforeRun=false --config.offline=true exec eslint src/data/upload-sign-out.test.ts`:
  pass; log `/private/tmp/upload-sign-out-fix-2-yyg0vonu/eslint.log`.
- The temporary config reuses the actual Vite/Vitest config and both setup files. Only the CPU report
  output paths in an OS-temp copy of the timer setup are redirected; timer enforcement is unchanged.
  Vite cache and config are also in OS temp. No test output is written into the repository.
  Initial config load rejected the symlinked `/tmp` setup path before collecting tests; canonical
  `/private/tmp` paths and explicit Vite filesystem access resolved that setup-only issue.
- No `pnpm check`, e2e, production fix, server, commit or integration: this assignment is red-only.

Research: no network; reuse the inherited official IndexedDB transaction lifecycle reference
<https://www.w3.org/TR/IndexedDB/#transaction-lifecycle> and Drive resumable protocol reference
<https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable> from this packet's
prior research. Clearing one transaction cannot prevent a later add transaction; the reds exercise
that boundary through the existing store, queues, fake adapters and production lifetime entry points.

removed: none.


## Fix round 2

This implementation repairs adversarial pass 2 BLOCK 1 in the existing queue/store homes.
Only src/data/upload-queue.ts, src/data/upload-store.ts and these notes changed. No test,
network call, Git-writing command, dependency, database schema or additional store was used.
The coordinator owns commits.

### Research and reuse

No network. Inherited official references, checked against the existing implementation:

- [IndexedDB transaction lifecycle](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle):
  the admission read captures the existing account marker; the metadata/bytes write transaction
  checks that captured version against the same marker before either put. The original
  account-wide purge transaction still increments the marker and deletes every folder's bytes.
- [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
  session URI, status query, 308 range and expiry behavior remain unchanged in the existing adapter.

### Implementation

Queue add initiates and awaits captureForgetVersion before its first hashing, storage estimation
or persistence request. Its local forget version is also taken at admission and passed to
reselection instead of being read again there. The store retains the original marker-read promise
in a WeakMap keyed by the exact admitted record. The later store.add reuses it through the
existing test/adapter wrappers; transaction retries keep the same captured version. Direct store
adds initiate the same capture at their own entry, before reading the Blob. Capture errors are
logged and remain attached to the admission: a subsequent write cannot recapture a newer marker
and instead follows the existing storage-failure fallback.

Every reselection admission clones the original record and properties, preserving reserved ID,
session, confirmed bytes and content identity while preventing overlapping reselections from
sharing or replacing their captured fence. The WeakMap is transient coordination in the existing
store, not another retention home; it is released after add settles or with the record's lifetime
when no durable write is attempted. No stored member field or object store changes.

The transaction still refuses cross-connection writes when the admission version moved. The
existing connection-local retireStaging permission and awaited late-removal path remain intact
for the earlier fix 1.2 contract: they do not replace the captured admission version or grant
another connection permission. Sign-out waits for that cleanup and reports its original failure.
Ordinary disposal, other-account/folder isolation, journal retention, memory fallback, count,
resumable transport and reselection validation remain covered by unchanged tests.

### Red evidence

Baseline: all eight committed fix-2 cases fail at src/data/upload-sign-out.test.ts:589; the ten
earlier tests pass. Each restores MEMBER_21 and its exact original 15-byte body after production
sign-out/auth expiry completed with zero records and null bytes. Exact failing names:

- upload-sign-out-forget: fix 2: new add storage.estimate() before sign-out
- upload-sign-out-forget: fix 2: new add storage.estimate() before auth expiry
- upload-sign-out-forget: fix 2: reselection Blob.arrayBuffer() before sign-out
- upload-sign-out-forget: fix 2: reselection Blob.arrayBuffer() before auth expiry
- upload-sign-out-forget: fix 2: reselection crypto.subtle.digest() before sign-out
- upload-sign-out-forget: fix 2: reselection crypto.subtle.digest() before auth expiry
- upload-sign-out-forget: fix 2: reselection storage.estimate() before sign-out
- upload-sign-out-forget: fix 2: reselection storage.estimate() before auth expiry

removed: 15 original production lines replaced (queue 9; store 6); 0 test lines removed.
removed: no store, stored member field, journal line, Drive file, behavior or assertion removed.
tests changed: none

### Verification

Evidence: `/private/tmp/upload-sign-out-fix-round-2-d2lffn7o/`. All output, Vite caches, CPU reports and optional
TypeScript build-info paths are under OS temp. Tests write no artifacts into the repository.
The temp config imports the real Vite/Vitest config and original app setup, with the timer setup
copied only to redirect its CPU report paths; timer enforcement is unchanged. No repository
config or test was edited. Explicit offline pnpm options prevent dependency auto-install.

- Baseline `pnpm exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2`: exit 1,
  eight intended fix-2 assertions fail and ten earlier tests pass; `red.log`.
- Final same reds: exit 0, 18/18 pass; `reds-final.log`. This includes all eight exact names above,
  both earlier cross-tab Blob-staging cases, the awaited removal-failure case and all older reds.
- `pnpm exec vitest run src/data --maxWorkers=2`: exit 0, 79/79 files and 4,178/4,178 tests pass;
  `data.log`. No contradicting test, load error, unhandled failure or timer-gate failure surfaced.
- `pnpm exec tsc -p tsconfig.app.json --noEmit`: exit 0; `tsc-app.log`.
- `pnpm exec tsc -p tsconfig.node.json --noEmit`: exit 0; `tsc-node.log`.
- `pnpm exec eslint src/data/upload-queue.ts src/data/upload-store.ts`: exit 0; `eslint.log`.
- All command output was redirected; only failure sections and aggregate results were read.
- `git diff --check`: pass; test-file diff empty; status shows only the two owned production
  files and these notes. Git was used only for read-only status/diff, never for a writing command.
- Full check, browser gates and designer closure were not rerun in this scoped fix round;
  their previously recorded environment/closure limitations remain. No green check mark claimed.

removed: 15 original production lines replaced (queue 9; store 6); 0 test lines removed.
tests changed: none

## Fix round 3 reds

Red-owning session for TL-P4-53 addendum 8, sweep per TL-P4-51. Read WORKER, this entry's
packet, and adversarial pass 3 (BLOCK 1). Production HEAD remains
`be1e602efd720c5b9c5c880bf4b4192568c96e4d`. The coordinator owns commits.
No production edit, network call or Git-writing command. Only the test and this requested notes
record changed. All 18 pre-existing cases, every assertion and every bound remain byte-for-byte intact.

tests changed: src/data/upload-sign-out.test.ts: add start-of-operation forget-fence regressions for Undo, addPile and chooseAgain; sweep store writers with retry, resume, reload and direct admission controls; preserve every existing assertion and bound.
removed: none

### Exact new names

1. `upload-sign-out-forget: fix 3: Undo awaits untrash before sign-out`
2. `upload-sign-out-forget: fix 3: Undo awaits untrash before auth expiry`
3. `upload-sign-out-forget: fix 3: Undo awaits untrash before no sign-out`
4. `upload-sign-out-forget: fix 3: addPile awaits declaration hashing before sign-out`
5. `upload-sign-out-forget: fix 3: addPile awaits declaration hashing before auth expiry`
6. `upload-sign-out-forget: fix 3: chooseAgain awaits hashing before sign-out`
7. `upload-sign-out-forget: fix 3: chooseAgain awaits hashing before auth expiry`
8. `upload-sign-out-forget: fix 3: retry reserves a file id across sign-out`
9. `upload-sign-out-forget: fix 3: resume after halt keeps a session across sign-out`
10. `upload-sign-out-forget: fix 3: reload resume keeps confirmed progress across sign-out`
11. `upload-sign-out-forget: fix 3: retryPile reserves a file id across sign-out`
12. `upload-sign-out-forget: fix 3: retry releases a refused file id across sign-out`
13. `upload-sign-out-forget: fix 3: new add awaits Blob read across sign-out`
14. `upload-sign-out-forget: fix 3: queue reselection awaits Blob read across sign-out`

### Sweep and live evidence

Searched add/save/put callers in upload-queue.ts, drive-vault.ts and upload-store.ts.
There is one byte-staging store.add caller, upload-queue.ts:318 (keepBytes), reached from
new add and chosenAgain. Existing fix 1.1/fix 2 assertions cover Blob reads, digest and estimate
waits. New cases 13–14 repeat admission fencing with two live sources, independent real queues
and independent store connections to shared fake IndexedDB.

DriveVault has one queue.add caller, drive-vault.ts:1724 (stageQueued). Its awaited callers
are addPile's initial staging and sendQueued/sendAll, reached by Undo, retryPile and chooseAgain.
Cases 1–7 exercise the real vault doors, with declaration hashing and reselection hashing barriers;
case 11 exercises the real retryPile door. No alternate store or queue was substituted.

There are two progress store.save callers: upload-queue.ts:434 (reserved file id) and :452
(shared progress callback). The latter is reached by onSession, onConfirmed and letFileIdGo.
Cases 8–12 pause those real saves before their IndexedDB transaction, including reservation
release on a permanently refused create. They cover retry, explicit resume after halt, and
start after reload. These paths already pass: save's conditional put never recreates a removed
record. The only pending/byte puts are upload-store.ts:275–276 (add) and :298 (save).
The version-marker put at :203 belongs to capture/forget, not pending-upload admission;
DriveVault's index.put calls update its in-memory listing, not the upload store.

Both tabs use real makeLiveSources lifetimes and real queues; fake Drive and IndexedDB are entirely
in memory. The queued account has a separately committed 10-byte control, verified before forgetting.
Every selected test Blob has the original 15 bytes `Synthetic bytes`. Transfers refuse offline
through the injected Drive hook while metadata operations remain available. No timer sleeps,
waitFor, timeout overrides or repository-writing test fixtures were introduced.

Undo commits removal first, then pauses the successful untrash answer for the actual pile folder.
Tab A completes production sign-out or the production auth watcher while tab B's Undo is suspended.
Fresh IndexedDB reads confirm zero records and null control/pending bodies before releasing B.
After Undo and all vault/queue work settle, both reds observe one record and its 15 original bytes.
The positive control without sign-out restores the pending upload and its original body, with
waiting/durable queue state. Its separate control remains, so the exact positive count is two.

The addPile and chooseAgain barriers precede their queue.add admission. Both sign-out and auth
expiry variants confirm forgetting first, then fail on resurrection of one record and its 15-byte
body after the delayed operation and queues settle. All six failures are intended storage assertions.
No contradiction with a preserved assertion remains in this targeted file.

### Final verification at HEAD

- Full file, `--maxWorkers=2`: exit 1; **32 tests, 26 pass, six intended assertion reds**.
  Exact failing names: 1, 2, 4, 5, 6, 7 above. All 18 existing cases and eight new controls pass.
  No load error, unhandled rejection, timeout or timer-gate failure in the final run.
- `tsc -p tsconfig.app.json --noEmit`: pass; `/private/tmp/upload-forget-fix3/types.log`.
- ESLint for the changed test: pass; `/private/tmp/upload-forget-fix3/lint.log`.
- `git diff --check`: pass. No check/e2e/server/fix/commit/integration in this red-only assignment.

The installed local Vitest binary was invoked directly to avoid pnpm dependency/network checks:

```sh
cd /private/tmp/upload-forget-fix3
node /private/tmp/bower-upload-sign-out-forget/node_modules/vitest/vitest.mjs run --config /private/tmp/upload-forget-fix3/vitest.config.mjs --maxWorkers=2 > /private/tmp/upload-forget-fix3/red.log 2>&1
```

The OS-temp config selects only src/data/upload-sign-out.test.ts, keeps jsdom and both original
setup files (including the timer gate), and sets Vite cacheDir to OS temp. The process cwd is OS
temp so the existing CPU reporter also writes there. Test logs, cache and CPU reports are all
under `/private/tmp/upload-forget-fix3`; tests never write into the repository. Read only failure
sections and aggregate results. TypeScript used --noEmit and ESLint did not use --fix or --cache.

Research: inherited official Drive resumable upload and IndexedDB transaction-lifecycle links in
this notes file's Research section; no references were fetched. Reuse the existing live sources,
queue, conditional progress put, IndexedDB implementation and fake stack. A transaction clear
cannot prevent a later admission that captures its fence after an earlier operation's awaits:
that is the shared late-capture mechanism pinned by these six reds.


## Fix round 3

Stopped under the owner's explicit TL-P4-51 instruction after the complete requested targeted
suite. Addendum 8 says the store refuses an older captured forget version on every upload write;
keeping both earlier fix-1.2 cases green requires accepting precisely such a write. No production
or test edit was made. No new store, network request or Git-writing command was used.
The coordinator owns commits. Only this notes append changes the repository.

### Every contradictory test (file:line)

Both cases are declared at `src/data/upload-sign-out.test.ts:382`:

1. `upload-sign-out-forget: fix 1.2: sign-out waits for staging cleanup and reports a late remove failure (remove fails: false)`:
   `src/data/upload-sign-out.test.ts:416` requires one retained record and `:417` requires all
   15 original bytes after the account purge transaction has committed (`:408`). The add started
   before that purge; its Blob read resumes only at `:413`. An older captured version must now
   be refused by the store, so those two required retained values cannot exist.
2. `upload-sign-out-forget: fix 1.2: sign-out waits for staging cleanup and reports a late remove failure (remove fails: true)`:
   the same contradictory assertions at `src/data/upload-sign-out.test.ts:416` and `:417`, plus
   `:438` and `:439` require the resurrected record and 15 original bytes after the injected
   removal refusal and sign-out settlement. Refusing the old-version write prevents those values.

The clear spy opens its barrier only after real `store.clear` completes (`:391`–`:393`);
this is not a pre-purge observation. Even while sign-out is awaiting cleanup, the account's
transactional forget marker has already advanced. The existing exception at
`src/data/upload-store.ts:273` admits that stale write through `stage.retiringVersion`.
Removing the exception implements the new rule but necessarily breaks both committed cases.
Retaining it would violate addendum 8. Changing an assertion, exempting local retirement, or
restoring bytes through another path would not satisfy this assignment.

These are the complete behavioral contradictions found in the upload store/queue tests and
production sign-out/expiry tests. The six fix-3 assertion reds agree with addendum 8 and remain
unimplemented pending resolution of the two frozen cases above. Ordinary disposal, journal
retention, isolation, retry/resume controls and the other earlier reds are not contradictions.

### Every store write path from the sweep

- `src/data/upload-queue.ts:318`, `keepBytes` -> store.add: new queue add and queue reselection
  (`chosenAgain`), including their estimate, Blob-read and digest waits. Current capture at `:847`
  starts at queue.add; it is too late for the enclosing vault operations below.
- `src/data/vault/drive-vault.ts:1724`, `stageQueued` -> queue.add -> keepBytes -> store.add:
  initial addPile (`:1002`, staging at `:1054`), Undo restore (`:449`, re-enqueue at `:487`–`:490`),
  chooseAgain (`:1261`, launch at `:1313`), retryPile (`:1224`, launch at `:1249`), and tracked
  send/sendAll (`:1612`/`:1629`) -> sendQueued (`:1729`). Each outer operation needs its own
  start capture propagated through its awaits and re-enqueue, not a new capture at stageQueued.
- `src/data/upload-queue.ts:434`, keepFileId -> store.save: reserved ID on first transfer,
  retry/offline retry, retryPile, explicit resume after halt, and hydration/start after reload.
- `src/data/upload-queue.ts:452`, shared save -> store.save: onSession, onConfirmed and
  letFileIdGo (permanently refused ID release/reset), reached by the same send/retry/resume paths.
  The send's start version must reach every progress callback and survive transaction retries.
- `src/data/upload-store.ts:275`–`:276`: IndexedDB pending metadata and byte puts from add.
  `:298`: conditional pending progress put from save. These are all pending upload puts.
  A single mandatory-version store write boundary would have to cover both add and save.
- `src/data/upload-store.ts:338`–`:339`: memory store add/save write the same transient held map;
  these also need the rule, including the direct-store entry points. No second store is needed.
- `src/data/upload-store.ts:203`: account-version marker put belongs to forgetting itself.
  list malformed cleanup, remove/discard/completion cleanup, and folder/account clear only delete
  pending records/bytes; they cannot resurrect them. Vault index.put updates a listing, not uploads.

No implementation was attempted after identifying the irreconcilable retained-byte assertions.
In particular, no optional version or late recapture was introduced to bypass the ruling or tests.

### Research and verification

No network. Inherited references: [IndexedDB transaction lifecycle](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle)
and [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable).
The existing clear transaction advances the shared marker before the paused add resumes; the
local retirement exception is the only reason these two tests currently see retained bytes.

Evidence: `/private/tmp/upload-forget-round3-h6wxwpmt/`. Commands use explicit pnpm offline and
verifyDepsBeforeRun=false settings. The OS-temp config reuses the real Vite/Vitest configuration,
jsdom and app setup. Reds ran with OS-temp cwd and the original timer setup. The complete data
suite needs repository cwd for its relative fixture reads: its final temp timer setup copy changes
only report paths and imports, preserving timer enforcement. Vite caches, CPU reports, logs and
TypeScript build-info paths remain under OS temp; tests write no artifacts into the repository.

- Reds: `pnpm exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2`: exit 1,
  32 tests, 26 pass, six intended fix-3 failures; `reds.log`. Exact failing names are Undo awaits
  untrash, addPile awaits declaration hashing, and chooseAgain awaits hashing, each before
  sign-out and auth expiry. Failures at `:679`, `:707`, and `:749` restore the original 15 bytes.
  All 18 earlier cases and eight new controls pass on unchanged production code.
- First whole-data run used OS-temp cwd and failed unrelated relative fixture reads; `data.log`.
  Corrected only the temporary execution setup and reran the complete suite from repository cwd.
- Final whole-data result: exit 1; 79 files, 78 pass; 4,192 tests, 4,186 pass and six fix-3 failures (`data-final.log`).
- `tsc -p tsconfig.app.json --noEmit`: exit 0; `tsc-app.log`.
- `tsc -p tsconfig.node.json --noEmit`: exit 0; `tsc-node.log`.
- ESLint on the three inspected production files: exit 0; `eslint.log`.
- All command output was redirected; only failures and aggregate results were read.
- `git diff --check`: pass; only this notes append is changed; production/test diffs are empty.
- No pnpm check, e2e, server, integration or commit after the required contradiction stop.

removed: none (0 production lines; 0 test lines).
tests changed: none

## Fix round 3 red repair

tests changed: src/data/upload-sign-out.test.ts: TL-P4-53 addendum 8: replace the two fix-1.2 cases' retained late record and 15-byte expectations with absence before cleanup settles and after sign-out; assert the real store add rejects with UploadForgottenError. Inject the removal failure on the pre-sign-out control record during the purge, rather than on the refused late write.

The clear spy attempts removal of the existing control record, preserves any removal error,
finishes the real account clear, opens the post-clear barrier, then rethrows that error.
The late staging cleanup retains its separate barrier and successful real removal. Existing
BowerError sentence, console.error cause, staging wait, cleanup wait, successful sign-out,
control-byte deletion and all other tests/assertions remain in place. Production is unchanged.
The two fix-1.2 test names remain unchanged for the existing verification contract.

No network. Research reused the IndexedDB transaction lifecycle and Drive resumable upload
references in the preceding section. No Git-writing command; the coordinator owns commits.

Verification: file run with --maxWorkers=2, exit 1; 32 tests, 24 pass and 8 assertion reds.
Both repaired fix-1.2 cases fail at src/data/upload-sign-out.test.ts:421 because the current
store still admits one late record. The six existing fix-3 reds remain: Undo awaits untrash,
addPile awaits declaration hashing, and chooseAgain awaits hashing, each for sign-out and auth
expiry. No other failures. Complete output: /private/tmp/upload-forget-round3-red-repair.log.
Command: node_modules/.bin/vitest run src/data/upload-sign-out.test.ts --config
/private/tmp/upload-forget-round3-h6wxwpmt/vitest.config.mjs --maxWorkers=2, invoked using the
absolute local binary from OS-temp cwd, with offline settings. The existing temporary config
and timer setup keep Vite cache and CPU reports in OS temp. Tests write nothing to the repo.
No pnpm check or e2e for this authorized test-only red repair. git diff --check passed.

removed: none (0 production lines; only the authorized retained-record/byte expectations replaced).


## Fix round 3

This fresh final-round session read WORKER, the packet, all three adversarial reviews and the
notes, including the committed fix-3 red repair. The repaired fix-1.2 absence assertions agree
with addendum 8; the previously documented retained-byte contradiction is resolved.
No production or test file changed, no network, no Git-writing command and no new store.
The coordinator owns commits. This notes append is the only repository change.

### Remaining frozen-test/API contradiction (TL-P4-51)

The assignment explicitly requires every caller to pass the forget version captured at its own
start into the store write API, with no write path without one. However, frozen test callers
still invoke `add(record, body)` and `save(record)` without a version. Barrier wrappers also
discard any additional argument before forwarding the call to the real store. Making the
version required in both existing write signatures cannot satisfy these calls and app tsc.
Accepting a missing argument, recapturing after a wrapper's await, or keeping a legacy
versionless write path would violate the explicit assignment. Tests may not be changed.

Evidence is a compiler-only in-memory overlay, not a repository or test edit:
`/private/tmp/upload-forget-fix3-final-nt1wcess/mandatory-api.cjs` changes only the two interface
signatures in the compiler host's read result, making add's third and save's second argument
mandatory. Full app diagnostics find exactly 25 missing-version test calls, three expected
production callers to update, and two existing unrelated test typing errors. Complete output:
`mandatory-api.log`; location summary: `mandatory-api-summary.log`, in that OS-temp directory.

Every missing-version test call (each location receives TS2554 in the overlay):

- `src/data/upload-store.test.ts:30`: keeps bytes/progress per account/folder, later member add.
- `src/data/upload-store.test.ts:31`: same test, first member add.
- `src/data/upload-store.test.ts:32`: same test, other account add.
- `src/data/upload-store.test.ts:33`: same test, other folder add.
- `src/data/upload-store.test.ts:36`: same test, session/confirmed/reserved-id save.
- `src/data/upload-store.test.ts:47`: removed-one-stays-removed test, initial add.
- `src/data/upload-store.test.ts:49`: same test, late progress save.
- `src/data/upload-store.test.ts:56`: folder/account-clear test, initial add.
- `src/data/upload-store.test.ts:57`: same test, other folder add.
- `src/data/upload-store.test.ts:58`: same test, other account add.
- `src/data/upload-store.test.ts:75`: no-IndexedDB test, add rejection call.
- `src/data/upload-store.test.ts:81`: database-replacement test, first add.
- `src/data/upload-store.test.ts:87`: same test, reopened connection add.
- `src/data/upload-store.test.ts:94`: malformed-record cleanup test, initial valid add.
- `src/data/upload-sign-out.test.ts:114`: original forget property, commit-before-forget wrapper.
- `src/data/upload-sign-out.test.ts:118`: same property, commit-after-forget wrapper.
- `src/data/upload-sign-out.test.ts:334`: delayedStaging wrapper, used by both fix-1.1 and both fix-1.2 cases.
- `src/data/upload-sign-out.test.ts:704`: both fix-3 addPile declaration-hashing cases, add wrapper.
- `src/data/upload-sign-out.test.ts:789`: all five fix-3 progressPaths cases, delayed save wrapper.
- `src/data/upload-resume.test.ts:157`: committedControl, used by generated staging-barrier test at :714.
- `src/data/upload-resume.test.ts:243`: reloadCase's stale-progress save; tests at :220 and :705 use it.
- `src/data/upload-resume.test.ts:725`: generated staging-barrier test's delayed add wrapper.
- `src/data/upload-queue-real.test.ts:274`: reserved-id/write-once test's observing save wrapper.
- `src/data/upload-queue.test.ts:667`: refused reserved-id retention test's first-failure save wrapper.
- `src/data/vault/drive-vault.test.ts:920`: landsAfterTheBin helper's delayed memory-store add wrapper.

The unmodified committed red repair also fails actual app tsc independently:

- `src/data/upload-sign-out.test.ts:395`: TS2345, `f.control[0]` may be undefined when passed to remove.
- `src/data/upload-sign-out.test.ts:423`: TS2532, the first mocked add result may be undefined.

These two errors are baseline test typing faults, not behavioral contradictions with forgetting.
The 25 caller diagnostics establish the mandatory write-API/no-test-edit conflict. No test
assertion is bypassed and no compatibility overload or optional version is introduced.

### Every store write path from the final sweep

- `src/data/upload-queue.ts:318`, keepBytes -> store.add: direct new add and chosenAgain
  reselection. Their own start capture must precede estimate, Blob reads and digest waits.
  Existing capture at :847 binds only queue admission, too late for outer vault operations.
- `src/data/vault/drive-vault.ts:1724`, stageQueued -> queue.add -> keepBytes -> store.add:
  addPile (:1002, initial staging :1054), restore/Undo (:449, re-enqueue :487-490),
  retryPile (:1224, send :1249), chooseAgain (:1261, send :1313). Every outer start capture
  must be forwarded through send (:1612), sendAll (:1629), sendQueued (:1729) and stageQueued
  (:1720), including fallback hashing at :1724; no recapture after their awaits.
- `src/data/upload-queue.ts:434`, keepFileId -> store.save: first transfer and retry/offline
  retry, vault retryPile, explicit resume after halt, and start/hydration after reload.
- `src/data/upload-queue.ts:452`, shared save -> store.save: onSession, onConfirmed and
  letFileIdGo (permanently refused reserved-id release/reset), through those same transfer
  paths. Each start version must survive every callback and connection/transaction retry.
- `src/data/upload-store.ts:275` and :276: IndexedDB pending metadata and byte puts from add.
  :298: conditional progress put from save. One required-version write boundary must check
  the shared marker transactionally for all three puts. The retirement exception at :273
  must be removed; no old captured version may commit even during awaited local cleanup.
- `src/data/upload-store.ts:338` and :339: existing memory store add/save mutate the held map.
  These direct write APIs also require their callers' captured version and the same refusal rule.
- `src/data/upload-store.ts:203`: the forget marker put is the forget operation itself, not
  an upload admission. list's malformed-record cleanup, remove/discard/completion, and
  folder/account clear delete records and bytes; they cannot resurrect them. The vault's
  index.put calls update its listing, not the upload store.

### Research and verification

No network. Reused inherited official references and inspected the existing mechanism:
[IndexedDB transaction lifecycle](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle) and
[Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable).
Required versions belong at the existing store's transactional write boundary, preserved on
retry; no alternate store, protocol, stored record format or upload mechanism is needed.

Evidence directory: `/private/tmp/upload-forget-fix3-final-nt1wcess/`. Explicit pnpm
verifyDepsBeforeRun=false/offline=true options prevent dependency auto-install and network.
The OS-temp config imports the original Vite config, uses the original app setup, and copies
the timer setup only to redirect CPU-report paths and resolve its imports. Timer enforcement
is unchanged. Vite cache, logs, CPU reports and tsc build-info paths are OS temp. The complete
data suite uses repository cwd for its existing relative fixture reads. Tests write no files
into the repository; no repository configuration or test was edited. Only failure sections
and aggregate summaries were read.

- Reds: exit 1; 32 tests, 24 pass, eight assertion failures; `reds.log`.
  Both repaired fix-1.2 cases fail their absence assertion at :421. Undo sign-out/auth expiry
  fail at :687; addPile declaration hashing sign-out/auth expiry at :715; chooseAgain
  hashing sign-out/auth expiry at :757. Original 15-byte bodies are restored in each race.
- Actual app tsc: exit 2; only the two existing committed-test errors at :395 and :423 above; `tsc-app.log`.
- Node tsc: exit 0; `tsc-node.log`.
- ESLint on inspected upload-store.ts, upload-queue.ts and vault/drive-vault.ts: exit 0; `eslint.log`.

removed: none (0 production lines; 0 test lines).
tests changed: none

- Complete requested data suite: exit 1; 79 files, 78 pass; 4,192 tests, 4,184 pass and
  the same eight assertion failures; `data.log`. No additional behavioral contradiction,
  load error, unhandled failure or timer-gate failure surfaced. Exact failing names are
  both fix-1.2 remove-fails variants, Undo before sign-out/auth expiry, addPile declaration
  hashing before sign-out/auth expiry, and chooseAgain hashing before sign-out/auth expiry.
- The mandatory-version overlay's 25 test diagnostics are exhaustive over the app compilation.
  The landsAfterTheBin wrapper at drive-vault.test.ts:920 is used by the late-Bin tests at
  :981 and :991 (helper calls at :982 and :992); both require forwarding the captured version.
- Read-only git diff --check: pass. Final diff contains only this notes append. No commit,
  integration, pnpm check, server, browser gate or production edit after the contradiction stop.

removed: none (0 production lines; 0 test lines).
tests changed: none

## Fix round 3 red repair 2

Contract (TL-P4-53 addendum 8): `captureForgetVersion(record): Promise<number>` returns
the version; `add(record, body, version: number)` and `save(record, version: number)`
require the version the caller captured at its own start. The store refuses an older one.
The capture is required, not optional; no versionless write or recapture after an await.

All 25 sites identified in the last Fix round 3 contradiction are repaired: 15 direct
writes pass the captured version and 10 wrapper write sites forward the complete argument
tuple unchanged. Direct store fixtures capture before their writes, removals, or database
replacement. reloadCase captures its retained record's version before stopping/releasing
and awaiting the old page, then passes it to the stale progress save. Without IndexedDB,
the capture-and-add operation is inside the existing rejection expectation, because capture
itself rejects without storage; no substitute version or fallback is introduced.

The two independent typing faults have explicit failing checks: the retained control must
exist before remove, and the staged add mock result must exist before reading its value.
No test name, assertion predicate, expected value, or contract number changed.

tests changed: src/data/upload-store.test.ts: TL-P4-53 addendum 8 write-API sweep: capture versions at fixture start and pass them through all 14 direct writes.
tests changed: src/data/upload-sign-out.test.ts: TL-P4-53 addendum 8 write-API sweep: forward all arguments at five wrapper writes; explicitly fail on absent control or mock result.
tests changed: src/data/upload-resume.test.ts: TL-P4-53 addendum 8 write-API sweep: preserve both staging wrapper tuples and capture the stale-save version before release and waits.
tests changed: src/data/upload-queue-real.test.ts: TL-P4-53 addendum 8 write-API sweep: observing save forwards every received argument unchanged.
tests changed: src/data/upload-queue.test.ts: TL-P4-53 addendum 8 write-API sweep: first-failure save forwards every received argument unchanged on the real-store path.
tests changed: src/data/vault/drive-vault.test.ts: TL-P4-53 addendum 8 write-API sweep: delayed memory-store add forwards every received argument after its barrier unchanged.

Verification: `/private/tmp/upload-forget-red-repair2-6imwm62v/` contains config, copied
timer setup, cache, CPU reports, `tests.log`, `tsc.log`, and app build info. The temporary
config imports the original Vite config and preserves timer enforcement; only report and
cache destinations and copied setup imports are redirected. Direct local Node executables
avoid package installs and network. No tests write into the repository.

Touched-file run: `node node_modules/vitest/vitest.mjs run --config
/private/tmp/upload-forget-red-repair2-6imwm62v/vitest.config.mjs --maxWorkers=2` with all six
changed test files: exit 1, 331 tests, 323 pass, the same eight assertion reds. Five files
pass; upload-sign-out.test.ts fails only these existing cases:

- fix 1.2 remove-fails false/true: metadata absence at src/data/upload-sign-out.test.ts:424.
- fix 3 Undo before sign-out/auth expiry: forgotten metadata/15-byte absence at :692.
- fix 3 addPile declaration hashing before sign-out/auth expiry: absence at :720.
- fix 3 chooseAgain hashing before sign-out/auth expiry: absence at :762.

Actual app tsc with OS-temp build info: exit 2, expected API diagnostics only in
upload-store.test.ts and upload-resume.test.ts (capture still optional; writes still
versionless in production). Both original typing faults at old :395/:423 are gone.
Production must implement the required Promise<number> capture and write signatures.
No compatibility overload, cast, suppression, production edit, or weakened assertion.
Read-only git diff --check: pass. No Git-writing command, commit, pnpm check, or e2e run;
the coordinator owns commits and this assignment is only the mechanical red repair.
Research: reused the existing store and inherited official references, without network:
https://www.w3.org/TR/IndexedDB/#transaction-lifecycle and
https://vitest.dev/config/#setupfiles. Argument forwarding uses the existing wrapper homes.
Removed: none. Production repair and integration remain with the assigned sessions.


## Fix round 3 (final)

Fresh implementation session: read WORKER, the packet, all three adversarial reviews,
the preparation and all entry notes, including Fix round 3 red repair 2. No network,
Git-writing command, test edit, new store, dependency or stored member-format change.
The coordinator owns commits. The production diff remains uncommitted in this worktree.

### Implementation and every store write path

The required store API now returns a number from captureForgetVersion and requires that
number on both add and save. The IndexedDB write helper at upload-store.ts:213 checks
that number against the account marker in the same transaction as every pending/bytes
put. Transaction/connection retries retain the original argument. No capture occurs in
add or save; no missing-version overload or local retirement exception remains.
Both existing backends use assertForgetVersion; the memory backend advances its account
version on account-wide clear and refuses stale add/save before mutating its held map.
No object store, schema upgrade, alternate queue or retention home was introduced.

Every production write route found by the add/save/put sweep:

- src/data/upload-queue.ts:329, keepBytes -> store.add(record, body, version).
  Direct add at :834 captures before estimation, persistence requests or Blob work;
  chosenAgain at :765 receives that same capture before its hashing and room checks.
  Enclosing vault operations supply their earlier version instead of recapturing here.
- src/data/vault/drive-vault.ts:1743, stageQueued -> queue.add(input, version).
  addPile at :1003 captures at :1006 before declaration hashing/index/Drive awaits,
  then passes it to initial staging at :1056 and the tracked send. Undo/restore at :449
  captures at :452 before untrash or journal/refresh awaits; :489 updates the retained
  entries with that version before re-enqueue. retryPile at :1226 captures at :1227
  and forwards it to queue.retry and retained entries. chooseAgain at :1264 captures
  at :1266 before hashing and Drive reads. send (:1616), sendAll (:1633), sendQueued
  (:1748) and stageQueued (:1739) carry the version through fallback hashing. A new
  entry picked up by an ongoing send retains its own enclosing operation's version.
- src/data/upload-queue.ts:448, keepFileId -> store.save(record, version): reserved ID.
  :466, shared save -> store.save(record, version): onSession, onConfirmed and
  letFileIdGo (permanent refusal releases the reservation/session/confirmation).
  Both closures use the send's snapshot of the initiating entry's captured version.
  Initial sends receive add's version; retry/offline retry captures at :923; explicit
  resume captures at :969; start/reload hydration captures at :809 before list/lock
  awaits; refresh captures at :343 before listing newly discovered records. Vault
  retryPile supplies its own earlier capture to queue.retry. These versions survive
  all transport callbacks and store transaction retries.
- src/data/upload-store.ts:261-262: add's pending metadata and byte puts go through write.
  :270: save's conditional pending put goes through the same write boundary, and a
  removed record still stays removed. :303-304: memory add/save check the same rule
  before changing the existing held map. Direct store fixtures now pass their versions.
- src/data/upload-store.ts:198: the marker put is forgetting itself, not an upload write.
  remove, clear and malformed-record cleanup only delete upload records/bytes. Vault
  index.put calls update its listing; none writes to the upload store.

Capture failures keep the existing explicit memory fallback without invoking a store write
without a version. The concrete queue always exposes its capture method; its public port
keeps that method optional for the older session queue stub, which never persists uploads.
A missing port capture cannot supply a version for a store write. The UploadStore capture
itself is mandatory. Same-queue forgetting still waits for staging and cleanup, including
refused stale writes, and retains the purge BowerError/cause path. All 32 sign-out tests pass,
including earlier reds, both repaired cleanup cases and the positive Undo/retry/resume controls.

### Complete remaining contradiction list (TL-P4-51)

The committed write-API repair missed the manually assembled brokenStore fixture at
src/data/upload-queue.test.ts:104-115. Its returned UploadStore (:107) forwards six
operations but omits captureForgetVersion. The mandatory store API cannot typecheck that
object; actual app tsc reports exactly TS2741 at :107. No production typing error remains.
There is no captured version available through this fixture. Making capture optional,
inventing a default version or admitting a versionless write would violate addendum 8.
Tests are frozen, so the missing fixture forwarding cannot be repaired in this session.

Every affected test, with declaration, fixture use and final failing call:

1. src/data/upload-queue.test.ts:582, `a storage failure mid-upload keeps sending from memory and says so, not as a Drive refusal`.
   brokenStore at :585; start fails at :586. Its successful durable add expectation at :587
   requires the actual store capture that this fixture omits.
2. src/data/upload-queue.test.ts:595, `bytes that cannot be read back fail in words about this device, not Drive`.
   brokenStore at :606; start fails at :607.
3. src/data/upload-queue.test.ts:624, `kept uploads that cannot be read at start are told once`.
   brokenStore at :627; start fails at :632.
4. src/data/upload-queue.test.ts:686, `when the device can neither keep the reserved id nor let go of the file, the try fails in words about the device`.
   brokenStore at :689; start fails at :690.

All four actual failures are TypeError: store.captureForgetVersion is not a function.
The whole requested data suite completed before stopping: no other failing test, behavioral
contradiction, unhandled failure or timer-gate failure. No test-specific production fallback,
cast, compiler suppression or fixture edit was added. Stopped under the explicit owner
TL-P4-51 instruction; this is blocked delivery, not a claim that the entry is complete.

### Research and verification

No network. Reused inherited official references against the existing local mechanism:
[IndexedDB transaction lifecycle](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle)
and [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable).
Atomic marker/write ordering belongs in the existing store; resumable session, status-query,
308/range, bounded expiry and reserved-identity transport remain in their existing homes.

Evidence directory: /private/tmp/uf3-b6wrc46k/. Every command redirected output there;
only failures and aggregate results were read. pnpm used explicit offline=true and
verifyDepsBeforeRun=false to prevent installs/network. The temporary Vitest config imports
the original Vite config and original app setup; its timer setup copy changes only report
paths/import resolution. Timer enforcement is intact. Caches, CPU reports, logs and both
TypeScript build-info files are OS temp. Tests write no artifacts into the repository.

- Before fix: requested reds, 32 tests, 24 pass and eight intended assertion failures;
  reds-before.log. Exact failed names are both fix 1.2 remove-fails variants, and fix 3
  Undo awaits untrash, addPile awaits declaration hashing, and chooseAgain awaits hashing,
  each before sign-out and auth expiry. Failures at :424, :692, :720 and :762 restore
  forgotten metadata and original bytes.
- After fix: pnpm exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2,
  with the OS-temp config: exit 0, 32/32 pass; reds.log. The subsequent whole-data run
  also passes the entire sign-out file after the final production port typing adjustment.
- pnpm exec vitest run src/data --maxWorkers=2, with the OS-temp config: exit 1;
  79 files, 78 pass; 4,192 tests, 4,188 pass; only the four fixture failures above; data.log.
- tsc -p tsconfig.app.json --noEmit, OS-temp build info: exit 2; only the missing
  brokenStore capture at upload-queue.test.ts:107; tsc-app.log.
- tsc -p tsconfig.node.json --noEmit, OS-temp build info: exit 0; tsc-node.log.
- ESLint on upload-store.ts, upload-queue.ts and vault/drive-vault.ts: exit 0; eslint.log.
- Read-only git diff --check: pass. No test-file diff. Only the three production homes
  and this notes append are touched. No commit, integration, server, pnpm check or e2e
  after the required contradiction stop; no green full-gate mark is claimed.

removed: 122 original production lines replaced (upload-queue.ts 34; upload-store.ts 70; drive-vault.ts 18).
removed: store retirement permission/state, record-identity admission WeakMap and versionless write signatures.
removed: 0 test lines; no store, stored record field, journal line, Drive file or assertion removed.
tests changed: none


## Fix round 3 red repair 3

tests changed: src/data/upload-queue.test.ts: TL-P4-53 addendum 8 write-API sweep: brokenStore forwards captureForgetVersion

The fixture forwards captureForgetVersion to the real store unchanged. No assertion,
expected value or test name changed. The retained production diff is byte-for-byte
unchanged (read-only diff snapshots compared with cmp). No Git-writing command or network.

- pnpm exec vitest run src/data --maxWorkers=2, with the OS-temp config and runner
  config loader: exit 0; 79/79 files and 4,192/4,192 tests pass.
- pnpm exec tsc -p tsconfig.app.json --noEmit, OS-temp build info: exit 0; no diagnostics.

Logs: /private/tmp/uf3-red-repair-3/data.log and /private/tmp/uf3-red-repair-3/tsc-app.log.
Reused the prior OS-temp config and timer setup with only temp paths changed; cache,
CPU reports, logs and build info remain outside the repository. Offline pnpm settings
prevent installs/network. Read only failures and aggregate results. No pnpm check or e2e
was run for this explicitly scoped fixture repair. The coordinator owns commits.


## Addendum 9 reds

tests changed: src/data/upload-sign-out.test.ts: added four live sign-out cases for TL-P4-53 addendum 9; no existing assertion changed

Red-owning session for defect sign-out-purge-skipped. Only the test file and this notes
append were edited. No production change, network, Git-writing command or commit.
The coordinator owns commits. Research reused the existing live-source, real queue and
IndexedDB fixtures, and the inherited official Vitest setup-files reference:
https://vitest.dev/config/#setupfiles. No additional mechanism or dependency was added.

New exact test names (all use the required prefix):

- `upload-sign-out-forget: addendum 9: offline sign-out with an unreadable account purges device uploads (known identity: false)`
- `upload-sign-out-forget: addendum 9: offline sign-out with an unreadable account purges device uploads (known identity: true)`
- `upload-sign-out-forget: addendum 9: a purge failure shows the sign-out sentence and logs both failures (remote fails: false)`
- `upload-sign-out-forget: addendum 9: a purge failure shows the sign-out sentence and logs both failures (remote fails: true)`

The unreadable-account fixture seeds three durable uploads: account A in two folders and
account B in one folder, with actual ten-byte Blob contents. Drive is offline. Without a
known identity, Worker me rejects before live sources are constructed, and current() is
verified to reject with that same error; startup cannot accidentally cache an identity.
With a known identity, current() first confirms Alex, then Worker me becomes unreadable.
Remote sign-out fails offline in both cases. The tests require metadata and bytes to be
forgotten across both A folders; B must also be forgotten without an identity and must
remain byte-for-byte intact with an identity. Both exercise production session.signOut().

The two purge-failure cases reuse liveFixture and the real queue/store. Store clear throws
a distinct synthetic error. Successful remote sign-out is the positive control; in the
second case remote sign-out also throws its own BowerError. Each outcome must be an
actual BowerError with exactly the existing sentence `Signing out did not finish. Try again.`
Console assertions require the original purge error and, when present, original remote
error by identity, so replacing one with the other cannot satisfy the combined case.

Verification: whole touched file, --maxWorkers=2, exit 1; 36 tests, 34 pass, two intended
assertion failures. All 32 pre-existing tests pass; both new controls pass.

- Unknown identity red: src/data/upload-sign-out.test.ts:335 retains A metadata and
  original bytes instead of empty lists/null bytes. The subsequent assertion at :339
  also requires B metadata and bytes to be forgotten; it is not reached on this build.
- Dual failure red: src/data/upload-sign-out.test.ts:364 console.error lacks the original
  remote sign-out error. The exact single-sentence BowerError and purge-cause assertions
  preceding it pass, reproducing the remote error being masked by the purge failure.
- Contradicting existing assertions: none in the completed touched-file suite.

Command: npm_config_offline=true npm_config_verify_deps_before_run=false pnpm exec vitest
run src/data/upload-sign-out.test.ts --maxWorkers=2 --config <evidence>/vitest.config.mjs
--configLoader runner, with stdout/stderr redirected to <evidence>/reds.log.
Evidence: /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/upload-addendum-9-tjbwsf_c/
The temporary config imports the original Vite config and original app test setup. A copy
of timer-gate setup changes only import resolution and CPU report destination; timer
checks remain active. Cache, setup copy and CPU reports are all in OS temp, not the repo.
An initial run could not resolve the macOS /var path alias; using its canonical /private/var
path fixed setup loading. Final evidence is an assertion red, not an import failure.
Read-only git diff --check passed. No pnpm check or e2e: assignment is tests-only reds.
Production fix and integration remain with their assigned sessions.

## Addendum 10 reds

Red-owning session for TL-P4-53 addendum 10, defect sign-out-forget-marker.
Read WORKER and the latest Fix round 3 sections and Addendum 9 reds. Only tests and
this notes append changed. No network, production edit, Git-writing command or commit.
The coordinator owns commits. No repository test artifacts were written.

tests changed: src/data/upload-sign-out.test.ts: add twelve production sign-out/auth-expiry cases for identity-free device fencing, raw IndexedDB retention, stale add/save across accounts, and fresh-generation write controls; preserve all existing tests and assertions.
tests changed: src/data/upload-store.test.ts: replace separate account/folder/member captures with one shared generation; rename the remaining capture locals to generation; preserve all assertions, test names, bodies and bounds.
tests changed: src/data/upload-resume.test.ts: name the existing reloadCase capture generation and forward that same value to save; preserve all behaviour, assertions, generated examples and bounds.

### Exact new test names

All twelve names start with `upload-sign-out-forget: addendum 10: `:

1. `no account-derived IndexedDB key or value remains after sign-out`
2. `no account-derived IndexedDB key or value remains after auth expiry`
3. `pre-sign-out add capture is refused (other account: false)`
4. `pre-sign-out add capture is refused (other account: true)`
5. `pre-auth expiry add capture is refused (other account: false)`
6. `pre-auth expiry add capture is refused (other account: true)`
7. `pre-sign-out save capture is refused (other account: false)`
8. `pre-sign-out save capture is refused (other account: true)`
9. `pre-auth expiry save capture is refused (other account: false)`
10. `pre-auth expiry save capture is refused (other account: true)`
11. `a write captured after sign-out still lands`
12. `a write captured after auth expiry still lands`

The existing liveFixture seeds the signed-in account in two folders and another account
in one folder, using the real upload store, queue and live sources. Both endings run the
production entry point: session.signOut(), or Drive auth refusal through vault.tree().
The pending real transfer settles before any post-forget observation or direct write.

The raw scan opens every object store in bower-uploads and reads every cursor key/value,
without list() filtering or assumptions about the fence key name. It checks the raw
synthetic email and independently computed SHA-256 hex in each key and value, including
text decoded from stored ArrayBuffers. Pre-forget controls prove both keys and values
really contain the signed-in scope hash. Post-forget reads use a fresh connection.
The unrelated account's upload remains a positive isolation control.

Stale-write cases capture before the production ending on one connection and attempt
add or save through another. Both the signed-out account and another account must reject
with UploadForgottenError; retained other-account metadata and bytes stay unchanged.
Fresh controls require exactly one generation increment, then successfully add and save
with the new capture and read back the exact record/progress and three-byte body.

### Complete existing-test sweep

Searched existing test/spec files for forgotten: and captureForgetVersion and inspected
the capture consumers. No existing test reads or asserts the forgotten: marker itself.
Every existing direct capture site follows, with pre-edit lines and current test locations:

- src/data/upload-store.test.ts:33-36, test at :27, keeps bytes/progress apart:
  four per-member/account/folder captures become one generation reused across all four
  additions and the progress save. Current capture is :33.
- src/data/upload-store.test.ts:54, removed-one-stays-removed test (now :48):
  the same single capture becomes generation; add and late save keep that value (:51).
- src/data/upload-store.test.ts:67-69, folder/account-clear test (now :59):
  three per-scope captures become one generation for all three adds (:64). Folder and
  account deletion assertions, including retention of the other account, are unchanged.
- src/data/upload-store.test.ts:91, no-IndexedDB test (now :81):
  the same attempted capture becomes generation (:86); rejection assertion is unchanged.
- src/data/upload-store.test.ts:102-103, database-replacement test (now :92):
  both members use one device generation (:97), including the post-reopen addition.
- src/data/upload-store.test.ts:118, malformed-record cleanup test (now :108):
  the same single capture becomes generation (:112); fixture and cleanup checks unchanged.
- src/data/upload-resume.test.ts:237, reloadCase used by tests at :220 and :706:
  the same single capture becomes generation and is passed unchanged to save at :244.
  This covers both the ordinary reload cases and all generated stale-offset cases.
- src/data/upload-queue.test.ts:108 forwards captureForgetVersion in brokenStore;
  it neither captures an account fence nor asserts one. Forwarding is already transparent;
  no rewrite or change to that file is needed.

The existing mandatory production capture API still takes a record argument. This
red-only change preserves that signature; the tests treat the returned number as one
device generation and no longer allocate a distinct capture for each account or folder.
The new cross-account cases reject the old per-account behaviour without a missing-API
error, a test-specific store or a production edit. No other contradictory assertion was
found in the complete touched-file run. The two existing addendum 9 reds remain unchanged.

### Verification and evidence

Evidence directory: `/private/tmp/upload-addendum-10-lnapc844/`.

Command (offline, output redirected to reds.log):

```sh
npm_config_offline=true npm_config_verify_deps_before_run=false pnpm exec vitest run --config /private/tmp/upload-addendum-10-lnapc844/vitest.config.mjs --configLoader runner --maxWorkers=2
```

The OS-temp config selects all three touched test files, imports the real Vite config and
app setup, and sets cacheDir to OS temp. The timer setup copy changes only absolute
import resolution and CPU-report destination; the original timer gate remains active.
All logs, cache, CPU reports and TypeScript build info are outside the repository.

- Full touched-file run: exit 1; 3 files, 67 tests, 59 pass and 8 assertion failures.
- Six intended addendum 10 reds: names 1-2 fail at upload-sign-out.test.ts:1011 because
  bytes still holds forgotten:<email hash>; names 4, 6, 8, 10 fail at :1047 because
  the other account's stale add/save succeeds rather than throwing UploadForgottenError.
- All six new controls pass: same-account stale add/save cases 3, 5, 7, 9, plus both
  fresh-generation controls 11-12. Both touched store/resume files pass in full.
- Existing addendum 9 failures are unchanged: unreadable account (known identity: false)
  at upload-sign-out.test.ts:335 and dual purge/remote failure (remote fails: true) at :364.
  All other existing cases pass. No import error, timeout or unhandled rejection.
- App tsc --noEmit with OS-temp build info: exit 0; types.log.
- ESLint on all three touched tests, no fix/cache: exit 0; lint.log.
- Read-only git diff --check: pass. No pnpm check, e2e, server or integration for test-only reds.

Research: reuse the existing live/IndexedDB test fixtures and the inherited official
[IndexedDB transaction lifecycle](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle)
reference for atomic fence/write ordering. No source was fetched and no dependency added.
Production implementation and integration remain with their assigned sessions.
removed: no existing assertion, test, bound or example; only redundant per-scope capture calls.


## Addenda 9 and 10

implementer: codex

tests changed: none

Implemented TL-P4-53 addenda 9 and 10 in the assigned worktree. Read WORKER,
the packet, prep ownership/reuse evidence, and the Addendum 9 reds and Addendum 10 reds.
No network, Git-writing command, dependency, new object store, schema change or new
user-facing sentence. All committed tests and assertions remain unchanged.

### Implementation

- upload-store.ts now keeps one numeric device forget generation at the constant
  `forget-generation` key in the existing bytes store. It contains no account identity.
  Both backends capture the same generation for all accounts. Every add/save still
  requires its original captured number; IndexedDB checks it inside the write transaction
  before any put, retaining addendum 8's refusal across connections and retries.
- Account-wide clear increments that generation atomically with removing that account's
  pending metadata and bytes. Clear without an account increments it and removes every
  account-scoped pending upload on the device. Folder-only clear keeps its earlier scope.
  Account/device forgetting also removes legacy `forgotten:<account>` keys, so old
  identity-bearing markers are not retained. The memory backend uses the same one-counter
  semantics, rather than a map keyed by person.
- upload-queue.ts extends the existing forgetAccount/clear route to an absent identity;
  it does not add a retention home. Its local staging-cleanup generation is now a scalar,
  with no retained per-account version map. Forgetting waits for outstanding staging
  cleanup and reports original cleanup/storage errors with the existing sign-out sentence.
- live/index.ts uses the session's last accepted identity without requiring another
  identity read during sign-out. A null reply does not erase that last known identity.
  No known identity means device-wide upload purge, including expiry. The cached scope
  is cleared before awaiting purge, including on failure. Both sign-out and expiry use
  this same forget path. Ordinary disposal and the folder-keyed journal outbox are unchanged.
- Remote sign-out errors are captured and logged before local forgetting. A purge failure
  is logged and returns the existing BowerError sentence, including when remote sign-out
  also fails; the original remote and purge errors are both logged. Successful purge
  preserves the remote error when that was the only failure.

### Red and green evidence

Evidence directory: `/private/tmp/upload-a9-a10-jbja_usx/`.
All pnpm commands used `npm_config_offline=true` and
`npm_config_verify_deps_before_run=false`. stdout/stderr went to OS-temp logs; only
failures and aggregate result lines were read. The OS-temp Vitest config imports the
real Vite config and app setup, overrides cacheDir, and uses a temporary timer-gate setup
copy with only absolute import resolution and CPU-report destination changed. Timer
checks remain active. No test, cache, CPU report or TypeScript build info was written
into the repository.

Before implementation, the exact committed addendum 9/10 cases were run with:

```sh
pnpm exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2 --config /private/tmp/upload-a9-a10-jbja_usx/vitest.config.mjs --configLoader runner -t 'addendum (9|10)'
```

reds.log: exit 1; 16 selected tests, 8 passed and 8 assertion failures:

- `upload-sign-out-forget: addendum 9: offline sign-out with an unreadable account purges device uploads (known identity: false)`
  failed at src/data/upload-sign-out.test.ts:335: retained metadata and bytes instead of absence.
- `upload-sign-out-forget: addendum 9: a purge failure shows the sign-out sentence and logs both failures (remote fails: true)`
  failed at src/data/upload-sign-out.test.ts:364: missing original remote error in console.error.
- `upload-sign-out-forget: addendum 10: no account-derived IndexedDB key or value remains after sign-out`
  failed at src/data/upload-sign-out.test.ts:1011: retained identity-bearing forgotten key.
- `upload-sign-out-forget: addendum 10: no account-derived IndexedDB key or value remains after auth expiry`
  failed at src/data/upload-sign-out.test.ts:1011: retained identity-bearing forgotten key.
- `upload-sign-out-forget: addendum 10: pre-sign-out add capture is refused (other account: true)`
- `upload-sign-out-forget: addendum 10: pre-auth expiry add capture is refused (other account: true)`
- `upload-sign-out-forget: addendum 10: pre-sign-out save capture is refused (other account: true)`
- `upload-sign-out-forget: addendum 10: pre-auth expiry save capture is refused (other account: true)`
  All four failed at src/data/upload-sign-out.test.ts:1047: stale other-account write succeeded.

After implementation:

```sh
pnpm exec vitest run src/data/upload-sign-out.test.ts src/data/upload-store.test.ts src/data/upload-resume.test.ts --maxWorkers=2 --config /private/tmp/upload-a9-a10-jbja_usx/vitest.config.mjs --configLoader runner
pnpm exec vitest run src/data --maxWorkers=2 --config /private/tmp/upload-a9-a10-jbja_usx/vitest.config.mjs --configLoader runner
pnpm exec tsc -p tsconfig.app.json --noEmit --tsBuildInfoFile /private/tmp/upload-a9-a10-jbja_usx/app.tsbuildinfo
pnpm exec tsc -p tsconfig.node.json --noEmit --tsBuildInfoFile /private/tmp/upload-a9-a10-jbja_usx/node.tsbuildinfo
pnpm exec eslint src/data/upload-store.ts src/data/upload-queue.ts src/data/live/index.ts
```

- targeted.log: exit 0; 3 files, 67 tests passed, including all 16 exact addendum 9/10 cases.
- data.log: exit 0; 80 files, 4,226 tests passed. No contradicting test or unhandled rejection.
- tsc-app.log and tsc-node.log: exit 0; both logs empty.
- eslint.log: exit 0; empty log, no fix/cache.
- Read-only git diff --check: pass. Only the three production files and this notes append changed.

pnpm check was not run: its test script writes reports into the repository, contrary
 to this assignment's explicit test-output constraint. No e2e/server/network or
Git-writing operation; packet integration, designer verification and commits remain
with the coordinator. Requested offline data/type/lint verification is complete.

### Standard solution and reuse

No sources fetched. Reused the packet's inherited official
[Google Drive resumable upload guide](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable)
and [IndexedDB transaction lifecycle](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle)
references and the existing upload queue/store adaptations. The existing session URI,
status query (`Content-Range: bytes */N`), 308 handling and expiry protocol remain intact.
The atomic readwrite transaction is the fence/write ordering home; a capture made before
forgetting cannot put bytes or progress after the generation changes. No second upload
store or sign-out purge mechanism was introduced.

removed: per-account durable forgotten:<account> marker writes; legacy identity-bearing marker keys on forgetting.
removed: per-account memory-store and queue staging-cleanup version maps.
removed: identity-read prerequisite and unknown-identity purge skip at sign-out.
removed: finally-path masking of the remote sign-out error when local purge also fails.
tests changed: none


## Addendum 9 red 2

tests changed: src/data/upload-sign-out.test.ts: added the offline retry red and never-known-identity control; no existing assertion changed.

Assigned evidence: `2026-10-11-codex-upload-sign-out-forget-adversarial-5.md`,
Blocking at `src/data/live/index.ts:364`. Only tests and this notes append changed.

- Red: `upload-sign-out-forget: addendum 9: a retried offline sign-out still purges only the last known account`.
  The real live session knows account A. Real queue/store uploads span A's two folders
  and account B (one pending upload, ten bytes). Remote sign-out rejects offline.
  After the first attempt both A folders and their bytes are absent, while B is intact.
  The same session retries with its account read and remote sign-out still offline.
  At `src/data/upload-sign-out.test.ts:367`, B's count is 0 instead of 1 and its body
  is null instead of `[1,2,3,4,5,6,7,8,9,1]`.
- Passing control: `upload-sign-out-forget: addendum 9: a retried offline sign-out purges every account when no identity was ever known`.
  With identity unreadable from the first session read, all three stored uploads and
  their bytes are absent after both attempts.

Verification (whole file, no name filter):

```sh
pnpm exec vitest run src/data/upload-sign-out.test.ts --maxWorkers=2 --config /private/var/folders/zg/53gb21k95_534c957t93xksw0000gn/T/upload-a9-red2-e7a9j2_b/vitest.config.mjs --configLoader runner
```

Exit 1: 50 tests, 49 passed, only the new named red failed on the intended assertion.
Log: `/private/tmp/upload-a9-red2.log` (copy of the OS-temp run log).
The temporary config imports the real Vite config and app setup, redirects cache,
uses canonical absolute paths, and copies timer setup with imports and CPU report
output redirected to OS temp. Timer checks remain active. An initial invocation
using the noncanonical `/var/folders` alias failed setup resolution before tests;
the canonical-path invocation above is the complete assertion run.
Read-only `git diff --check` passed. No repository test outputs, network, Git writes,
production edits, node_modules changes, or existing assertion changes.

Standard solution/reuse: reused `unreadableAccountFixture`, actual live session,
actual upload queue, and fake IndexedDB store; no helper purge or second mechanism.
Inherited offline source: [IndexedDB transaction lifecycle](https://www.w3.org/TR/IndexedDB/#transaction-lifecycle).
No source fetched. Implementation, commits, pnpm check and e2e remain with the coordinator;
this assignment owns only the red and control.
