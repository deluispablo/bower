# Pending draft bytes cleanup candidate

2026-10-05; sole implementer `/root/google_setup_rework`. Plan `2026-10-05-contracts-2`; P2/O1, C02/C14, adopted D02 device/person cleanup (original S02 prerequisite mapped C01/C02). Entry `pending-draft-bytes-cleanup` / qa17. Latest coordinator resume ACTIVE6b3ee99 and original full five-path assignment read. Exact base **f97e7b78d2d35cc7fe7ea0df1ee51db08d678744**; immutable candidate **f219a40ca073a69a2231aded3a926d83dcf163e8** on `codex/p2-draft-memory-cleanup`, owned `/private/tmp/bower-p2-journal-ack`. Final git status--short empty. Original17 branch is preserved. One candidate commit, exactly the five reserved paths; no shared records/features/proofs/passes/done.sh, production session/Worker/Drive/UI/runner/schema/journal changes, provider/browser/credential access, delegation, push or phase closure. R1v1/v2 packets remain read-only; coordinator alone integrates after its separately bounded provider case.

Canonical bower-session and bower-implement/implementer brief followed; actual Git/shell/Node26.10.0/pnpm12.8.1 and independently prepared dependencies available. No Claude execution or delegated result. Existing qa17 pure-production reproduction a90154a9 and independent prerequisite bfecf275 read; this candidate's meaningful red is new actual repository test execution, not merely their supplied historical evidence.

## Result and compatibility

`src/data/draft-files.ts` owns the single original Map and unchanged keep/get/per-key forget functions, adding internal all-drafts cleanup. The feature module re-exports only the compatible three methods; no data→feature production dependency, duplicate Map, storage/principal/version/wire or new Sources API. The exact retained Blob identity and individual forget semantics remain verified through original public feature imports. Missing/corrupt metadata is not parsed or used to decide which keys exist.

`forgetThisPerson()` synchronously clears every pending Map key before accessing Storage. It separately attempts each of the same six local/four session person keys, logging actual exceptions and continuing other accessible keys. It does not broadly clear either Storage, touch the folder-keyed journal outbox, device preferences or goodbye semantics, or falsely assert inaccessible keys were removed. Denied keys actually remain in the tests; unconditional memory cleanup and accessible-key continuation are the verified guarantees.

Production LiveSession ordering is untouched: actual successful remote logout/delete and shared auth-expiry route call central cleanup; failed non-auth remote logout rejects while bytes/metadata remain, and actual successful retry clears them. No early cleanup during failed logout was introduced. Existing account/folder epoch isolation, Worker/Drive behavior and journal-owner routing remain unchanged.

## Test-first and exact verification

Test additions only were written first, against original f97 production with no new data module. Therefore the red imports existed and exercised the real Map/cleanup; no missing-module/setup error supplied proof. Current test source was retained unchanged for the fix.

Exact unchanged registered command:

```sh
npm_config_verify_deps_before_run=false pnpm vitest run src/features/piles/draft-files.test.ts src/data/live/live.test.ts -t "person cleanup forgets pending draft bytes and keeps the folder outbox"
```

- `red.log`: **exit1, 11 genuine assertion failures, 88 filtered skips, 99 tests/2 files**. Seven device/draft cases and four actual public LiveSources cases. The same selected Blob survived logout/delete/auth-expiry and successful retry; partial Storage failure attempted only first local key instead of all10. No import/setup failure or production cleanup/Map mock.
- `green.log`: **exit0, 11 passed/88 filtered skips/99 tests, 2 files** after only the allowed minimal production correction.
- `relevant.log`: **exit0, 110 passed/3 files** using full draft-files, live and Add tests. Original S01/Add11 controls remain byte-identical; no Add UI/handler changes or weakened assertions. Original two draft keep/get/per-key/reload-unkept controls remain.
- `check.log`: **exit0, 560 passed/52 files**, lint/typecheck/build/harness213217/bundle/landing complete. Expected synthetic diagnostics are retained in the raw full log; no unhandled-test or teardown failure. Existing large-chunk build warning also appears in baseline. `git diff--check` exit0.

Related command:

```sh
npm_config_verify_deps_before_run=false pnpm vitest run src/features/piles/draft-files.test.ts src/data/live/live.test.ts src/features/piles/Add.test.tsx
```

Full command: `npm_config_verify_deps_before_run=false pnpm check`. No browser suite/preview was used; coordinator owns serialized affected browser/integration/inverse-red proof gates and final closure.

## Actual covered scenarios

Seven meaningful cleanup cases independently expect all Map keys absent via public get: two keys including orphan without metadata, all10 seeded person keys, missing or corrupt item metadata, individual local/session removeItem denial with exact attempted/failed-key observations, local getter unavailable with session keys still removed, both getters unavailable with memory still cleared and metadata truthfully retained, repeat cleanup then new same-visit keep/get/per-key forget. Each preserves exact literal `bower:outbox:FOLDER_A`, absent B outbox and actual `bower:prefs` theme bytes. Exception tests substitute platform Storage methods/accessors only; they neither mock production Map nor wrap cleanup with extra clearing. Diagnostics are asserted against the actual injected denial object. Synchronous post-return get assertions establish memory cleanup does not depend on a future task or promise.

Four LiveSources cases construct actual Sources/FakeDrive/FakeWorker under existing fixtures, flush initial journal work before seeding a literal original-folder outbox at the actual root ID, keep two Blobs through the feature API, and invoke actual public session calls. Logout and deletion both return current:null; deletion alone preserves bye1. Expiry executes Worker sign-out then injected Drive auth refusal through watchAuth/LiveSession.expire; it returns auth error/current:null and central cleanup runs. A conforming offline BowerError from the first remote signOut leaves identical pending Blobs, all person metadata, outbox/preferences and no goodbye; the following actual successful signOut clears bytes/person keys while preserving outbox/preferences. No real account or provider is involved, and no cleanup or Map is mocked. Existing remote deletion-failure/goodbye tests pass in the full related file; new byte-retention failure assertion specifically covers logout.

## Installation evidence and continuity

The assignment's once-only init ran before its temporary R1-priority suspension. `npm_config_offline=true npm_config_verify_deps_before_run=false bash harness/init.sh` still attempted registry tarballs on this pnpm host; DNS failed. It was explicitly stopped with SIGTERM of the independently identified owned pnpmPID70747, **exit143**, not a completed installation or test failure. `init.log` retains DNS/retry/termination evidence. Prepared node_modules were backed up/restored as independent bytes in this owned checkout, preserving internal symlinks without a shared writable whole-tree link; no package/lock changes. `baseline-check.log` then completed **exit0, 549 tests/52 files/harness213217**. These two stages remain separate from actual assertion-red proof. On resumed same entry no init/install, network escalation or dependency recovery was repeated.

No unfinished source was discarded during suspension: f97 checkout stayed clean/read-only until explicit resume. Logs and independent prepared-deps backup remain outside the repo. The immutable evidence manifest hashes selected logs/diff/source snapshots only, not the large dependency runtime copy.

## Limits and next step

The repair forgets the module's retrievable unsent byte references within the current page. It does not securely erase other held Blob references, implement durable uploads or account binding across reload, prevent later stale callbacks from keeping a new key, or prove cross-account UI/provider exposure. It does not delete a blocked browser storage key or claim successful inaccessible cleanup. It leaves already-made folder outbox lines intact and makes no new journal-dispatch/authorization claim. No semantic/second-brain capacity, P3/P4 or P2 phase acceptance follows from these11 green regressions.

Independent immutable five-path candidate review is next. Coordinator must retain evidence, serialize integration after actual R1 execution, perform its required inverse-red/check/verify/browser gates and decide entry closure; worker never closes it. P2 remains open.
