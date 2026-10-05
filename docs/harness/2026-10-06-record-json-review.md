# Independent review: record-json-authority

Reviewer `/root/record_json_review`, Codex, 2026-10-06 Europe/Madrid. Skills loaded: bower-session and bower-review; reviewer brief, startup, governance, coordination, method, adopted PRODUCT/WORK_PLAN/P2_ACCEPTANCE, PHASES, architecture, HANDOFF and current ACTIVE inspected. Git, shell and byte hashing are available. Runtime/test/browser capabilities are not needed for this read-only assignment. No init, test, build, dependency installation, product-module execution, provider/network/browser operation, Git mutation, shared-record edit or delegation was performed. Only this new scratch report was written.

## Exact target and scope

Plan `2026-10-05-contracts-2`; P2 O3, C02/C03/C12/C14; entry `record-json-authority` (qa-20). Integration packet read at `/Users/deluisp/Projects/bower-app`, frozen `dcfdb04a047bc7beb32d6e606383c63fd6b3526d`, adopted main `10ca886626206e0d4d880d6679dd4f57adcafcee`. The worker's immutable functional assignment was issued against main3136adc; the later docs-only authority update does not change this helper's canonical contract.

Reviewed checkout `/private/tmp/bower-p2-record-json`, branch `codex/p2-record-json`, clean at inspection. Base `8a478f4427b1748aada14e648035c192cd714b3b`; committed loadable stub `84edfd88474776b21ca9d96f3dfb0cb69c7cd0b7`; candidate `5e3afa6272965ba6d199db4f6a3ff4dc3434d7f3`, whose parent is that stub. Exactly two new files: `src/data/contracts/record-json.ts` and `record-json.test.ts`. Both base-to-candidate and stub-to-fix scope were inspected; read-only diff whitespace checking is clean. No existing consumer, fixture, schema, interface or configuration changed.

Acceptance verify, inspected but not executed by this reviewer:

`pnpm vitest run src/data/contracts/record-json.test.ts -t "record JSON preserves canonical authority"`

Normative input: ratified B contract `aede6ef26f21b894dfd9c169cd158c812534ed333b8f77c461105529fcaabdeb`, original ten-file manifest `3b954ed6a8b6e42c9188ead54b3b29657e79bd0f1fd3a1680fa371b2e0e218de`, and TL-P2-04 direct UTF-16 integer-key emission requirement. Both original hashes were checked. The added Drive-ID discriminator is separate from that original manifest.

## Verdict

**Critical: 0. Important: 0. Minor: 1, open.** This is a bounded helper review, not permission to close the entry or P2. The coordinator requires all known findings resolved before integration/closure. A behavior change needs review of the new immutable target and corresponding evidence.

### M01 — custom-prototype arrays bypass the advertised prototype refusal

Location: `/private/tmp/bower-p2-record-json/src/data/contracts/record-json.ts:169` (array branch returns at 173; the prototype guard is only reached at 175). Related coverage: `record-json.test.ts:97` and 113; the delivered candidate report states that custom prototypes are rejected.

Trigger for an implementer regression: create `class CustomArray extends Array<number> {}` and call `canonicalRecordJson(new CustomArray(1, 2))`. Static tracing gives descriptors `0`, `1`, `length`; the array branch accepts both data elements and returns the successful bytes `[1,2]`, without reaching the custom-prototype guard. `Object.setPrototypeOf([1], { inherited: true })` follows the same bypass. This is a reasoned source finding, **not an executed reproduction**.

Effect: the accepted container domain is broader than the declared refusal contract. The existing Date/object-accessor tests do not exercise array prototypes. JSON-decoded ordinary arrays and the reviewed golden records are unaffected; this does not demonstrate a hash collision, permission bypass, data mutation or provider failure, so severity is Minor.

Suggested fix: explicitly validate the permitted array prototype before the array return, using the ordinary Array prototype produced by the strict parser; document any deliberately permitted null-prototype exception. Add a genuine failing regression for a subclass/custom-prototype array before changing implementation, retaining successful ordinary-array ordering and accessor/toJSON non-execution controls. Do not weaken existing valid record fixtures or broaden this finding into an unsupported general Proxy guarantee.

## Reviewed behavior

Fatal UTF-8 decoding leaves a BOM in the decoded input so the complete grammar refuses it. Reader whitespace is JSON whitespace only; top-level trailing input, malformed punctuation/escape strings and invalid token grammar refuse. Every nested object tracks decoded keys before insertion. Null-prototype parsed objects preserve `__proto__` and `constructor` as data. Paired surrogate checking covers both strings and keys without Unicode normalization.

Numeric inspection confirms safe nonnegative integer validation and negative-zero refusal, with a separate decimal coefficient/exponent test rejecting fractions rounded into integers and nonzero underflow. Exact integer spellings such as 1.0/1e2/1000e-3 and positive zero remain legitimate. Canonical numbers emit plain decimal for the supported safe domain.

Canonical object keys are emitted directly in UTF-16 order rather than relying on rebuilt-object enumeration; the 10-before-2 and supplementary-key literals distinguish this. String escaping is isolated; arrays preserve index order. Descriptor validation refuses own accessors, hidden/symbol properties, sparse arrays and unsupported nested values; cycles refuse while shared acyclic objects remain allowed. No ordinary getter or toJSON hook is invoked along these inspected paths. M01 is the array-prototype exception.

Each encoder call supplies independent UTF-8 output. Supplied parse bytes are read through their view and not modified. Hashing uses unchanged existing SHA-256 over canonical bytes, distinct from raw-content hashes. Literal fixture digests and UTF-8/Unicode/control-character goldens are independent expected values. Recognized Refusal supplies no value; other reader/emitter/hash errors propagate rather than being silently normalized. Failure reasons are internal domain results, with no user-facing write operation introduced.

## Evidence and chronology

Worker delivery report `d79fe4eaa7f85e51b140402e6249d3b19ed36e31649cee49d3726b9d9e64832a` matches the archived bytes. Root's explicitly root-authored sixteen-artifact manifest hashes to `b7c601d1f1d3364810bbe1df709ccd010862684161c6932c2154c26c814598f4`. All 16 artifact byte counts and hashes were independently checked. Final source snapshots equal worker files: module `577ac4961305d11e49fe46ab44519e8035a6c75df7ce3d2f7bc8d4138c375aa1`, test `485074937182fe99359c75ae06b835897b4b5a91729b43c16f9c90a270df2d46`.

Logs preserve the interrupted DNS setup attempt as failure, then baseline/stub gates with 607 tests/53 files. The stub commit precedes the named suite. The first 81-case run contains 48 assertion failures plus 2 fixture-loader failures; the retained corrected loader run contains 50 genuine assertion failures and 31 controls. This latter run is the relevant red proof, not the loader errors. Initial 81 green and later 84 green are separately preserved; the three extra numeric literals are honestly later controls of existing behavior.

The first full gate's two new-test lint errors and next gate's architecture assertion failure (690/691) remain archived. The final full gate records 691/54, then build/harness/bundle/landing completion; post-commit unchanged verify records 84/84. Expected comments explain recognized refusal plus unexpected rethrow rather than changing the architecture test. These are inspected implementer gate results, **not fresh reviewer executions**. Root integration/inverse proof is still required.

## Set aside and next action

Unknown schema fields, record shapes/references, scope/permission authority, recovery/claims/readiness/report publication, compatibility consumer activation, provider CAS, semantic capability completion and browser usability are outside this two-file foundation. The nine proposed recovery fixtures were not executed as journeys; two actual fixture records were used only for encoding/hash assertions. No complete C-row or phase acceptance follows. Existing R1-OBS01 and other registered defects remain separate.

Return M01 to the implementer under coordinator ownership, capture its discriminating red and fix, and obtain immutable affected review before serialized integration and genuine final-fix-only inverse closure. No candidate or record was changed by this reviewer.
