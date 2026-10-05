# Drive raw byte read candidate — qa19

2026-10-05. Sole assigned implementer `/root/approved_policy_slices`; canonical bower-session/bower-implement and implementer/startup briefs followed. Plan **2026-10-05-contracts-2**, main3136adc, P2/O3 C03/C14/C16, entry **drive-raw-byte-read**. Exclusive worker `/private/tmp/bower-p2-raw-read`, branch `codex/p2-raw-read`; base **e3ddfd2d49142af678f7482afbefa44ad9bf30e8**. Integration coordinator remains root; prior parser checkout stayed read-only.

Separate loadable typed-stub commit **821757f68ccef4131c505bb8b6a82173576e9320**. Final fix/test commit **32b2a19cffed20d4b09d04c36ba7c40722e5b88a**, sole parent821757f. Final Git status clean. Whole base→candidate changes exactly five allowed paths: `src/data/drive/drive-api.ts`, `drive-http.ts`, `fake-drive.ts`, NEW `raw-bytes.test.ts`, and `src/data/live/live.test.ts` with exactly one additive readBytes delegate in its existing typed client wrapper. No existing test assertion changed.

No source consumer/UI/parser/Worker/runner/write-token/CAS/schemaB/config/package/lock/shared-record changes, provider/browser/private credentials, delegation, push, done.sh or phase closure. Candidate requires independent review and serialized coordinator integration; no self-review verdict.

## Additive contract and behavior

DriveApi adds exactly `readBytes(id: string): Promise<Uint8Array>` with independent returned arrays. Existing readText methods are untouched. DriveHttp uses the same existing authenticated GET media route/call helper as readText; its actual new body operation is Response.arrayBuffer, without decoding, BOM stripping, Unicode normalization or UTF-8 repair. The returned buffer is copied, including when an injected transport retains its ArrayBuffer. Existing token refresh, request retry and transport/refusal behavior are reused rather than duplicated. Body-read exceptions are logged with their actual object; existing BowerError is rethrown, TypeError becomes offline, other failures become unknown. No extra metadata request, read/version token or write-precondition guarantee is supplied.

FakeDrive gates/fetches the actual stored file first. Null remains empty; actual stored strings produce UTF-8 bytes and blobs use arrayBuffer, with independent copy and typed/logged read failure. In-memory big blobs still return their actual original bytes. Restored `big` snapshots hold the existing decoded placeholder for old readText compatibility, but readBytes refuses with BowerError unknown / “This device no longer has this file's contents.” A private optional availability flag is not a persisted wire field. Snapshot v1 re-emits its existing `big` representation across repeated restore/snapshot; metadata/name/place/Bin/untrash stay independent and available.

Old restore→snapshot could already have serialized the small placeholder as b64 while retaining original large metadata size. Restore additionally refuses that historical producer shape: b64 blob at or below KEEP_BYTES with original metadata size above KEEP_BYTES. This prevents presenting reduced placeholder bytes as original; it neither adopts a new schema nor certifies arbitrary metadata/content provenance. Original small/full available inputs remain supported. Only an actual successful fresh writeText removes unavailable status after existing gate/version checks; offline/conflict/metadata operations do not. Explicitly writing the same placeholder string creates real new source bytes and is correctly treated as available, distinct from silently treating the retained placeholder as original.

## Actual test-first chronology

Exact registered verify, with environment-only suppression of native pnpm auto-install:

```sh
pnpm_config_verify_deps_before_run=false pnpm vitest run src/data/drive/raw-bytes.test.ts -t "drive raw bytes preserve source authority"
```

- Baseline fullcheck **exit0,607 tests/53 files**. Added interface/class typed rejecting stubs plus the required client-wrapper delegate; full stubcheck **exit0,607/53**, then committed stub821757f. No absent API/module proof.
- Authored initial23 tests before implementation. `red.log`: **exit1,23 genuine assertion failures**, not missing-method/import/TypeError load errors. Positive reads explicitly assert resolved outcomes against typed stubs; failure tests assert actual auth/not-found/body/refusal details. `initial-red-suite.test.ts` retains that exact initial suite.
- Implemented only the two assigned classes. `green-first.log`: **exit0,23 passed**. `check.log`: **exit0,630/54**, all gates. There were no first-implementation assertion/sensor failures.
- Added one test-first historical v1 repeated-placeholder case within the assigned restoration scope. `legacy-placeholder-red.log`: **exit1,1 genuine assertion failure/23 passed**, actual placeholder Uint8Array returned instead of refusal. Added the bounded old-shape availability guard. `green.log`: **exit0,24 passed**, `check-final.log`: **exit0,631/54**. The supplemental input was then completed with the literal root record and normal f1/counter/timestamp layout to match the old producer; its b64/large-size/refusal expectations were unchanged. This fixture refinement is not claimed as the earlier red's exact entire input.
- Final immutable fixture/test source: `green-final.log` **exit0,24 passed** and `check-final-fixture.log` **exit0,631 tests/54 files**, lint/strict types/build/harness215/219/bundle/landing. `git diff --check` exit0. All failures/intermediates remain retained; no expected value/test/sensor was weakened to hide a regression.

Tests use independent literal binary, invalid UTF-8, BOM/CRLF/Unicode and empty bytes. Both clients compare exact arrays; text/Blob/subarray construction, repeat reads, independently retained transport buffer, two HTTP clients, actual small fake snapshot/restore and original-source immutability are checked. Old readText string/BOM behavior and Blob/HTTP replacement decoding are explicitly kept separate from byte authority. Actual large upload→restored unavailable→three repeated snapshots, metadata move/rename, Bin/untrash, failed offline/stale writes, successful fresh write/reopen and identical-placeholder explicit write produce observed stored effects. Error tests cover existing fake failures, HTTP one-refresh401, auth exhaustion,404, offline transport and logged HTTP/FakeBlob body failures with no extra dispatch. Current existing transport retry/Drive/live contract tests also pass in fullcheck; no real HTTP request was made by these tests.

## Setup evidence

Actual Node26.10.0/pnpm12.8.1, Git/shell available; no browser needed or granted. This NEW checkout initially had no node_modules. Ran exactly one bash harness/init.sh. Registry DNS failures stalled its internal retries; under the assigned recovery authorization interrupted only owned session74170 (**exit130**), retained init.log, and subsequent bounded process inspection found no matching installer. No second init or other process termination occurred.

At dependency-copy time node_modules did **not** exist: setup.json records partial_existed_at_copy=false and partial_preserved=false. No first partial was renamed; no claim is made that nothing ever existed during init. Independently copied root's vetted node_modules with relative internal symlinks preserved:1918 checked, no whole-directory symlink/hardlinks or write to root dependencies. Package/lock identities matched. Used **pnpm_config_verify_deps_before_run=false** only in environment for scripts; no npm-prefix revalidation attempt, persistent configuration, new package or network recovery was performed in this assignment. Baseline/stub/final checks are actual recovered executions, distinct from failed installation. Git index commits required bounded sandbox escalation into shared worktree metadata; only assigned local commits were made.

## Immutable evidence and limits

Public evidence `/private/tmp/bower-raw-read-evidence/`: setup/init, baseline/stubcheck, actual original red and source, first green/check, historical-placeholder red, subsequent/final greens/checks, stub class snapshots, final interface/HTTP/Fake/test snapshots, candidate.diff/fix.diff and exact live-delegate.diff. packet-hashes.json lists every public evidence file identity, excluding dependencies/build/test-result outputs.

Final source SHA256:

| File | SHA256 |
| --- | --- |
| drive-api.ts | 3887664db4caa2b4f9b57b35127f42c6c85ce8f7d9b49a57637aeb9027e284ed |
| drive-http.ts | ca4a7c4f529aa8d14bd11854c7ac1a66aaa007a999371ed5346cb6b80ef40da1 |
| fake-drive.ts | 97710a872109117d41ddedd8c297e682c1b097e7bec7790781b4b6ece0ab05da |
| raw-bytes.test.ts | 49b6af5e508cfd3e2b9b84676f49a55acde05ecfddea6d09a0c6bf22d8e08e5d |

Existing actual R1 provider pins remain historical execution pins; DriveApi/HTTP hashes now changed by this authorized additive read. No new real-provider byte/version/CORS/permission guarantee follows from stubs. R1-OBS01 stays open. This does not connect ownership/2 to app consumers, activate producers, implement raw writes, retained-byte policy, migration, scheduler or whole C03/C14/C16/P2 acceptance. Historical b64/full-size metadata corruption beyond the specified unavailable shape is not newly claimed comprehensively validated.

Next: independent review whole **e3ddfd2→32b2a19**, then root serial integration of stub and fix. Inverse-red closure must use **--fixed-in FINALFIX ONLY**: reverting the final two-class production changes restores typed loadable rejecting stubs while preserving DriveApi/delegate and final24 tests. Do not reverse the additive stub/API commit and create missing-method proof. Root alone records entry/proof/passes after its actual integration checks. Worker remains clean/read-only awaiting review.
