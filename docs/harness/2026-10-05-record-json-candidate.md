# qa20 — strict canonical record JSON candidate

Implementer `/root/prerequisites_review`, 2026-10-05. Plan `2026-10-05-contracts-2`, P2 O3 C02/C03/C12/C14, TL-P2-04 and exact ratified B `aede6ef2` / manifest `3b954ed6`. Root remains sole coordinator/integrator. This is implementation delivery, not independent review, entry closure or phase acceptance.

## Immutable candidate and ownership

- Base `8a478f4427b1748aada14e648035c192cd714b3b` (main method3136adc; existing parser257f904, Drive source1dc7f64).
- Exclusive checkout `/private/tmp/bower-p2-record-json`, branch `codex/p2-record-json`.
- Separately committed loadable stub `84edfd88474776b21ca9d96f3dfb0cb69c7cd0b7`.
- Final fix `5e3afa6272965ba6d199db4f6a3ff4dc3434d7f3`; clean checkout, frozen for independent review.
- Exactly two NEW paths: `src/data/contracts/record-json.ts` and `record-json.test.ts`. No existing source, fixtures, schemas, interfaces, consumers, shared records, config, package or lock file modified. Raw-read implementation is in a separate checkout and disjoint paths.
- Git index writes initially refused by filesystem sandbox; the assigned owned commits were successfully authorized through automatic review escalation. No other checkout's Git was mutated; no push or remote.

## Frozen API and behavior

`RecordJsonResult<T>` is `{ok:true,value:T}` or `{ok:false,reason:'encoding'|'syntax'|'duplicate-key'|'unicode'|'number'|'value'}`. There is no partial/normalized value on refusal.

- `parseRecordJson(bytes: Uint8Array): RecordJsonResult<RecordJsonValue>`: fatal UTF-8 decode preserving BOM for syntax refusal; complete recursive JSON grammar; duplicate **decoded** key refusal at every object nesting; paired Unicode; exact nonnegative safe-integer numeric domain including lexical decimal/exponent precision; no -0. Supplied bytes remain unchanged. Objects have null prototype to preserve `__proto__` as ordinary own data.
- `canonicalRecordJson(value: unknown): RecordJsonResult<Uint8Array>`: direct ordered key emission by UTF-16, including integer-like `10` before `2`; arrays retain order. JSON.stringify escapes individual strings only. Rejects unsupported values, cycles, sparse arrays, hidden/symbol properties, accessors and custom prototypes without invoking getters/toJSON. Preserves Unicode/CRLF/whitespace; returns independent UTF-8 buffers without trailing newline.
- `hashRecordJson(value: unknown): Promise<RecordJsonResult<string>>`: hashes those exact canonical bytes using existing `vault/hashes.ts` SHA256 helper. Raw text hashes remain distinct. Known validation Refusal returns explicit failure; unexpected/platform errors propagate. The two catch delegation sites state this explicitly for the existing architecture gate.

Exact tokens such as `1.0`, `1e2`, `1000e-3` and positive zero with a large exponent represent permitted integers. Fractions rounded by Number(), including `9007199254740991.0000000001`, `5000000000000000.1`, `9007199254740991.1`, `1.00000000000000001` and underflow `1e-999999`, refuse. Canonicalization does not turn damaged raw numeric authority into a new integer. Duplicate escaped keys, supplementary keys, prototype-like names and decomposed versus precomposed Unicode are independently covered.

## Test-first chronology and actual gates

All commands run only in the owned checkout with actual environment `pnpm_config_verify_deps_before_run=false` after copying vetted dependencies. It changes dependency verification only, not tests or assertions.

1. `bash harness/init.sh` attempted once. Registry DNS failures; owned session59927 stopped by Ctrl-C, exit130 before gates. **NOT PASS.** Preserved init log. `ps` was denied by sandbox; no foreign process was touched.
2. Authorized independent root dependency copy: ordinary file copies, no hardlinks, 1918 preserved symlinks, all relative, package/lock/config unchanged. Baseline `pnpm check` exit0, 607 tests/53 files. No second install/init loop.
3. Typed loadable stub written; full `pnpm check` exit0, 607/53; committed84edfd8 before tests.
4. NEW suite had81 cases. First run exit1: 48 assertion failures plus two fixture loader URL-scheme errors. Original log retained. Only fixture loader changed to literal repository-relative path; no expectations changed.
5. Loaded stub re-run **before implementation**: exit1, 50 genuine assertion failures /31 passing controls, no loader/TypeError/module failures. `bower-record-json-assertion-red.log` is the valid red evidence.
6. Implemented minimal helper: initial named suite81/81 green. Added the lead's three explicit numeric literals as controls of the already implemented and previously red precision boundary; not claimed as a later failing repair. Named suite84/84 green.
7. First full check failed lint in new fixture construction only (unnecessary quote escape and sparse-array literal). Same golden bytes/holes/assertions retained using String.raw and explicit sparse array construction.
8. Next full check passed lint/typecheck and690/691 tests; existing architecture gate flagged two catch blocks delegating to the typed refusal helper. Added truthful expected comments describing recognized refusal and rethrow of unexpected errors; no test/gate suppression or existing test changes.
9. Final complete `pnpm check` exit0, **691 tests in54 files**, lint/typecheck/build/harness/bundle/landing checks green. Existing21 lint warnings and build size warning retained. Harness count215/220 is unchanged and not acceptance.
10. Committed final5e3afa6 after gate. Exact unchanged registered verify after commit exit0, **84/84**:

`pnpm vitest run src/data/contracts/record-json.test.ts -t "record JSON preserves canonical authority"`

Golden expectations are literal bytes and independent SHA256 values, including actual ratified declaration `6f4d484c644dd6b541967ea60ad56ed508d8ec520ac2c99a1b3a075afa00aca1` and manifest `9badff317145d753071b77cb70bd17c13ac745047180d0e0b6e341c1a1eef088` from the frozen fixture. Reparse reproduces identity without modifying supplied bytes. These are actual encoding/hash tests, not execution of the proposed recovery events.

## Hashes (SHA256 exact bytes)

| Artifact | SHA256 |
| --- | --- |
| `src/data/contracts/record-json.ts` | `577ac4961305d11e49fe46ab44519e8035a6c75df7ce3d2f7bc8d4138c375aa1` |
| `src/data/contracts/record-json.test.ts` | `485074937182fe99359c75ae06b835897b4b5a91729b43c16f9c90a270df2d46` |
| unchanged `src/data/vault/hashes.ts` | `9b4686e4078b1d137ad74f8c258c9e85181bb76ce21c21e91abb11099b5b45ba` |
| unchanged ratified `01-admission-reopen.json` | `a7fcfaaf929729f3e066c512124b3d24166ec3af245f02cb2644e01704a34856` |
| unchanged `package.json` | `cc541e046f6402a2a9535c97cfb618f41dbd03a43239476dc99b514b3ca9afeb` |
| unchanged `pnpm-lock.yaml` | `e75ae74146548fbfe431bb4e401c03f3993c4ac44b7c742c9fcd8a7af030faaa` |
| `/private/tmp/bower-record-json-init.log` | `09f42340aea15cfb0086533553cce57d4e7005812e0a24130f53bb231f8cd082` |
| `/private/tmp/bower-record-json-baseline.log` | `ffe9953be84709bb659f08e626442b94df88bb6c9e4353c5d5863817ea75ad70` |
| `/private/tmp/bower-record-json-stub-check.log` | `bfc3825949e9aa29295a2233a66e1cf7a32c511a35c88ab2a824d979dfe07a6e` |
| `/private/tmp/bower-record-json-red.log` (initial loader errors retained) | `dfb4799640bbff84374e0b3ddd77c6ee6ee817489d1d385fcacdea44806d41d1` |
| `/private/tmp/bower-record-json-assertion-red.log` | `4727c5fdbcab41bd8055a759b48894749469eab18d17d0bbe8848a32ed19280d` |
| `/private/tmp/bower-record-json-green-initial.log` | `f168a4895b5221370df14a6163ad98e9ff1831bd6e8a754a556a60eb7dd77e4c` |
| `/private/tmp/bower-record-json-green.log` | `5139de24fb468bb27674218ef6124c9d27e4ddd0725651a2bb9c2966eeb5d3e2` |
| `/private/tmp/bower-record-json-final-check.log` (lint failure) | `38ac7a9b7c372604b005fce380bd26ffc5bfddf0bcbae8421d106d4864ac254c` |
| `/private/tmp/bower-record-json-final-check-retry.log` (architecture failure) | `c11408178c0b860ae9c73172906e3eb2330ddfd2b3a3a0e9dce1bfe4634bc376` |
| `/private/tmp/bower-record-json-final-check-green.log` | `799c1e2df9140b0efac6373312c152a127db06d0ab5b6c8cf3757ac382410822` |
| `/private/tmp/bower-record-json-final-verify.log` | `fa51bef3d56b3abb6052a4aae57c9f2a10a87d3e745b8b2f46cf6bdd4a0b2e6d` |

## Limits and next action

No record shape/version/reference/report binding, principal/scope authority, claim engine, readiness producer/consumer, raw byte adapter, UI, browser/provider/network/private data, durable execution, CAS or next-phase work is implemented. Successful domain encoding supplies integrity only, never permission. No browser gates are required for this pure module; none were run or claimed. No delegation, self-review, shared records or done.sh.

Root assigns fresh independent review on exact5e3afa6, then serially cherry-picks the stub and final fix. Final-fix-only inverse proof must restore the loadable stub while retaining tests. Shared record guards/report materialization/consumers remain separately assigned later units. Root alone may close this entry; P2 remains open.
