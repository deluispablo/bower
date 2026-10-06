# record-json-authority M01 correction

Implementer `/root/prerequisites_review`, 2026-10-06. Plan `2026-10-05-contracts-2`; P2 O3 C02/C03/C12/C14; adopted main `10ca886626206e0d4d880d6679dd4f57adcafcee`; coordinator assignment `6c47169a5bf0397d722fa1de5098fe875447e01b`. This is an implementation delivery, not self-review, entry closure or phase acceptance.

## Immutable scope

Base `5e3afa6272965ba6d199db4f6a3ff4dc3434d7f3` → correction `140d8aec8e238e1f36c193666a836b74206e9e68`. Same exclusive checkout `/private/tmp/bower-p2-record-json`, branch `codex/p2-record-json`. Original loadable stub `84edfd88474776b21ca9d96f3dfb0cb69c7cd0b7`, prior candidate,84-test delivery and every previous log remain unchanged. Only `src/data/contracts/record-json.ts` and `.test.ts` changed. Checkout clean and frozen after commit. No merge/main/reinstall/config/package/lock/fixture/consumer/interface/shared-record changes, network/provider/browser/private data, delegation or done.sh. Existing exclusive dependencies/setup/baseline reused. Owned Git metadata escalation authorized the correction commit; no other checkout mutation.

## Reproduction and fix

Independent report `2026-10-06-record-json-review.md` identified M01: array branch returned before object prototype guard. Added independent rejection cases for array subclass, replaced custom prototype and null prototype, each empty/nested, separately through canonical and hash APIs. Inherited getters/toJSON hooks are never invoked and own data is unchanged. Three positive literal ordinary parsed-array controls preserve order and identity; prior84 tests stay unchanged.

Production was untouched when unchanged registered verify ran against5e3: exit1,12 genuine assertion failures /87 passing controls /99 total, no loader/TypeError/setup failures. Only after recording red.log did production add one guard plus explanatory comment before the array return: `Object.getPrototypeOf(value) !== Array.prototype` yields the existing explicit `value` refusal. No null-array exception is permitted; null-prototype ordinary objects remain supported. No new error enum/API/encoding/hash/numeric/string/shape policy.

Named verify after fix exit0,99/99. Full `pnpm check` exit0,706 tests in54 files, followed by successful build/harness/bundle/landing. Existing warnings retained. No browser gate for this pure module. Committed140d8ae, then unchanged verify exit0,99/99 on committed files. Commands used actual `pnpm_config_verify_deps_before_run=false`, the same authorized dependency environment, without changing test behavior.

Exact registered verify:

`pnpm vitest run src/data/contracts/record-json.test.ts -t "record JSON preserves canonical authority"`

## Exact artifact hashes

SHA256 of exact bytes, including formatting/newlines:

| Artifact | SHA256 |
| --- | --- |
| `check.log` | `995e85882d682c8bb197c47c34a46161c93ca3560207a47513669961fdca9aa7` |
| `correction.diff` | `dbbaee8cb33414f21c3b6c4b99eadb5d220030a68565f1926857fb95d83ff758` |
| `final-verify.log` | `5d7fa32f10466eb727f5653c53727b5ee542d88700ae4c1ebc8750e3c9903c68` |
| `green.log` | `220b7f935d025a5416a81fae84289bb34415e9b5e763be3ed92c24d10aed095b` |
| `record-json.test.ts` | `4b213421958c893e1adf650fc9638760a973e174e76e52827fc4e1dc557f09a3` |
| `record-json.ts` | `d019457ffaf5b5506de3c68ae76ffa179b263da614f9c697f1bae5415f079529` |
| `red.log` | `739a127b6226318eec3827d894786b6de487294b526538a0ab9f27a434ca3447` |

## Next action and limits

Root arranges fresh immutable delta review. After clean verdict, root serially integrates the separate stub and combines reviewed5e3 + this correction into one complete final fix; final-fix-only inverse restores the loadable stub with all99 tests retained. Root alone updates passes/progress and closes the entry. No schema guard, declaration/readiness producer, authority/permission, provider CAS, runtime recovery/report barrier or P2 acceptance is inferred. Do not start B2 until an exact new assignment after review/integration/proof.
