# Independent S02 pending draft bytes cleanup review

2026-10-05. Reviewer `/root/prerequisites_review`; assignment in integration ACTIVE at `c349099`. Plan `2026-10-05-contracts-2`, P2/O1 C01/C02/C14 and adopted D02. Latest main planning documentation checkpoint reported by the coordinator is `53034a9`, retaining this revision; `d12c55e` is its original adoption provenance. Entry `pending-draft-bytes-cleanup` / qa17. Root remains sole integrator/shared-record writer and separately owns the real R1 operation.

## Verdict and immutable target

**No Critical, Important or Minor findings in the assigned candidate.** The actual prerequisite defect is repaired within the current-page memory scope. The candidate is suitable for coordinator integration after the separately reserved real R1 operation ends, followed by required integration verification, inverse-red proof and affected browser gates. This review does not close the entry, certify durable erasure/reload recovery, or accept any P2 capability as complete.

Exact base `f97e7b78d2d35cc7fe7ea0df1ee51db08d678744` → candidate `f219a40ca073a69a2231aded3a926d83dcf163e8`; branch `codex/p2-draft-memory-cleanup`, prepared checkout `/private/tmp/bower-p2-journal-ack`. The read-only Git range inspection confirmed one candidate with exactly five assigned paths; status was clean and HEAD matched the assigned immutable SHA. No Git mutation was performed.

- Delivery `/private/tmp/bower-draft-memory-cleanup.md`: SHA256 `7e5654897968b5146dbcda73f1e44d1360a222e6b7a63c007508cd35395ff983`.
- Manifest `/private/tmp/bower-draft-memory-cleanup/packet-hashes.json`: SHA256 `42c27a53684679e9a3bf2225087308020764abac00c71eceb1e929d72e33b101`.
- All17 declared public evidence files match length/hash; all five candidate-source snapshots match the assigned checkout bytes.
- NEW `src/data/draft-files.ts`: `a367f900447795b13d7a5faf7059c8423e2f752ed5ca169c48f08e1e71966b11`.
- `src/features/piles/draft-files.ts`: `51c4178c654c4c96da1bcf42b2d5a00d2ab06de144a4aefa63a4757f18ee8951`.
- `src/data/device.ts`: `4b96cbed7c5c0ae87901aa2d6728d519eb3889a71160b1bf8e4dc8c699bf1d21`.
- `src/features/piles/draft-files.test.ts`: `1bb205e079cbaf9c49f0a174ef04eeb9e55f6c7d23a8b22f7c8ce03b08042c0a`.
- `src/data/live/live.test.ts`: `d963ad86ee7d29131026e98d8424f0fb4c37fad0c1d5ac5d3e1d4b339db22f6a`.

## Source behavior and compatibility

`src/data/draft-files.ts:7–23` contains the sole Map and unchanged typed keep/get/per-key forget functions, plus synchronous forgetAll. The original feature path becomes a compatible three-function re-export at `src/features/piles/draft-files.ts:2`. There is no second Map or data→feature production import. Both Add's existing producers/consumers and device cleanup now refer to the same module instance. Blob references are returned unchanged; no cloning, encoding, persistence, principal schema or Sources/Worker API is added.

`src/data/device.ts:27–37` calls forgetAll before any Storage getter/removal. It clears selected and orphan keys without inspecting missing/corrupt Add metadata. The unchanged six local and four session person keys are then attempted separately. Each real Storage exception is diagnosed and later keys/types still receive their attempt. A denied key is not reported or tested as deleted. There is no production Storage.clear; folder-keyed outboxes, preferences and existing goodbye behavior are untouched. Repeated cleanup is harmless and compatible new keep/get/per-key forget still works during the same visit.

The issue is production-plausible: a file selected in Add remains in this page's shared module when successful logout/deletion or current auth expiry invokes person cleanup. Demo routes already call the same function; fake and real Sources use the same LiveSession implementation. Tests exercise actual public LiveSources with synthetic FakeDrive/FakeWorker, rather than a mock cleanup or fabricated provider response.

Production LiveSession is unchanged. `src/data/live/session.ts:86–108` invokes cleanup only after successful worker logout/deletion and the existing epoch check. Expiry at153–158 calls it synchronously; `watchAuth` at `src/data/live/index.ts:36–47` continues to rethrow the auth error while notifying expiry only for the current lifetime. Non-auth failed logout therefore keeps the identical selected/orphan bytes and metadata, rejects, and permits a successful retry which clears them. Deletion's goodbye remains success-only. Existing epoch/refusal/journal routing is not modified.

Add.tsx and its11 controls are outside the diff. Existing import path, missing-byte guard, held-admission freeze, successful per-key cleanup and failure behavior are preserved. No feature UI or wire/hash/reselection/shared-readiness behavior changes. The extra feature import in live.test.ts is test-only and deliberately checks compatibility through Add's public facade.

## Test-first evidence inspected

Exact registered verify remains:

```sh
pnpm vitest run src/features/piles/draft-files.test.ts src/data/live/live.test.ts -t "person cleanup forgets pending draft bytes and keeps the folder outbox"
```

The worker's shell prefix disabling pnpm dependency revalidation does not change this selection. Test additions imported existing facade/device modules before the new data module existed; baseline red is not a missing-module/setup failure. The candidate production diff is only the holder relocation/facade and minimal device cleanup.

Supplied `red.log` records11 genuine assertion failures: seven public device/draft cases and four actual LiveSources lifecycle cases, with88 filtered skips. Selected Blob remains retrievable in the old implementation after cleanup/logout/delete/expiry/successful retry; the per-key failure test observes only the first local deletion attempt instead of all10. Expected absence and exact attempted keys are independently specified. For baseline tests stopped by their first failed assertion, subsequent retention/error assertions are not falsely presented as red observations; corrected green executes the remainder.

Supplied `green.log` records11 passed/88 filtered skips. The seven cases cover selected+orphan bytes, normal all10 metadata removal, absent/corrupt item metadata, individual local/session remove denial, one/both getter denial, repeated cleanup and fresh per-key use. Failure controls explicitly assert retained blocked keys and actual exception objects while accessible keys disappear. Literal folder A outbox and actual bower:prefs bytes remain exact, folder B outbox remains absent. Post-return get assertions prove synchronous reference removal.

Four LiveSources cases perform actual session logout, deletion, watchAuth expiry through Drive auth refusal, and failed offline remote logout followed by successful retry. Sources state is checked current:null after successful endings; goodbye is1 only for deletion. Tests keep two real synthetic Blob objects and seed the outbox at the Sources' actual root ID after flushing initial journal work. Production cleanup and Map are not mocked. New byte-retention failure coverage specifically concerns logout; existing deletion failure/goodbye controls remain unchanged in the related file.

Supplied `relevant.log`:110 tests/3 files green, including original Add11 and two original holder compatibility controls. Supplied `check.log`:560 tests/52 files plus lint/typecheck/build/harness213/217/bundle/landing, with no unhandled-test or teardown error found. Existing lint/build warnings are retained. Those unchanged harness counts do not close qa17 or P2. The once-only init DNS failure/termination exit143 is separately retained from prepared-dependency baseline549-green; it is not misrepresented as installation success or assertion evidence. No repeated init was required on resume.

## Limits and coordinator handoff

I inspected source/diff, assigned entry and current ACTIVE, relevant adopted obligations, prior prerequisite, raw public evidence and exact hashes. I used read-only Git/source inspection and hashing; ran no tests/modules/init/build/browser/provider, accessed no credentials/private configuration, made no source/shared-record changes, delegated no work and closed no entry. The only new output is this report. Worker test runs are supplied evidence, not reviewer executions.

This removes references retrievable from the holder at central cleanup time; it cannot securely erase Blob references already retained elsewhere. It does not prevent a future stale callback from adding bytes again, persist or principal-bind files across reload, certify inaccessible browser keys erased, or prove cross-account UI/provider exposure. That bounded scope is consistent with the adopted D02 and does not waive P2 recovery/compatibility obligations. No accepted run, durable-envelope, report-save, semantic capacity, provider premise or P3/P4 change is demonstrated by this slice.

Next: root waits for its serialized real R1 operation to end, then performs integration and required proof/gates against the integrated SHA. Later source changes require affected-delta review. P2 remains open and phase acceptance remains the owner's decision.
