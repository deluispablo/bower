# Independent delta review: record-json-authority M01

Reviewer `/root/record_json_review`, Codex, 2026-10-06 Europe/Madrid. Same independent reviewer as the original review; no implementation authorship. bower-session, bower-review and reviewer brief remain loaded. Git, ownership, current ACTIVE reservation and planning revision were refreshed. Read-only shell/Git/byte hashing used; no product-module execution, tests, init, build, install, network/provider/browser/private credentials, Git mutation, source/shared-record edits, delegation or closure. Only this new report was written.

Plan `2026-10-05-contracts-2`; P2 O3 C02/C03/C12/C14; entry `record-json-authority`. Frozen integration checkpoint `d5b35adb357fc58f59bde9d832a2e6e39b401c6d`; adopted main `10ca886626206e0d4d880d6679dd4f57adcafcee`. Integration's plan revision matches main. Assignment: ACTIVE section “Record JSON M01 frozen; independent delta review.”

## Exact immutable target

Checkout `/private/tmp/bower-p2-record-json`, branch `codex/p2-record-json`, clean at inspection. Reviewed delta `5e3afa6272965ba6d199db4f6a3ff4dc3434d7f3` → `140d8aec8e238e1f36c193666a836b74206e9e68`. Correction is directly parented by the original candidate. Exactly two permitted files changed: `src/data/contracts/record-json.ts` (one guard plus comment) and `record-json.test.ts` (35 added lines, 15 cases). Read-only diff checking is clean; archived correction.diff equals the Git delta byte for byte.

Original review `082ed5f20955f3a36489820c730eec57e9c386d9c852d7fd0abbf7a1d10ffe6c` and its reviewed 84-test scope are reused explicitly. Original stub `84edfd88474776b21ca9d96f3dfb0cb69c7cd0b7`, all original sixteen artifacts and their hashes remain unchanged. B contract `aede6ef2` / original manifest `3b954ed6` / TL-P2-04 remain the normative canonical contract; no schema change occurred.

## Verdict

**Critical: 0. Important: 0. Minor: 0. M01 resolved at the exact reviewed target. No known finding remains within this assigned helper scope.** This is independent source/evidence review, not entry closure or full capability/P2 acceptance.

At `record-json.ts:171`, every array now checks its immediate prototype against the ordinary Array prototype before length/index emission. Array subclasses, replaced custom prototypes and null-prototype arrays produce the existing explicit `value` refusal; nested instances encounter the same recursive guard. The guard does not invoke inherited getters or toJSON. Ordinary arrays produced by Reader, ordinary literal arrays, ordering and previously supported shared acyclic objects remain valid. The separate object guard at 177 is unchanged, so parsed/null-prototype ordinary objects remain supported. Recognized refusal and unexpected-error propagation are unchanged.

The new tests at 128–160 discriminate M01 through both canonical and hash APIs: twelve independent refusal cases cover subclass/custom/null prototypes, empty and nested containers, inherited hook counters and unchanged own data. Three positive parsed-array literals cover empty, populated and nested ordinary arrays. Original 84 cases, their assertions and literal canonical/digest goldens remain unchanged. There is no attempted universal Proxy or cross-realm guarantee; this guard defines the ordinary local array domain used by the strict parser.

## Evidence inspected and verified

Original eight-artifact manifest SHA256 `82ac067c88576ba92052412f87d3962965754627a97165ee61c4167e32cef255` checked; all eight artifact hashes independently match, using the explicit archive path map for `.ts.txt` source snapshots. Delivery report SHA256 `e7428e31ea3b47fc4164c365beab2b20b052d62f555396e622919306de112521` matches. Final module snapshot equals worker source, SHA256 `d019457ffaf5b5506de3c68ae76ffa179b263da614f9c697f1bae5415f079529`; final test snapshot equals worker source, SHA256 `4b213421958c893e1adf650fc9638760a973e174e76e52827fc4e1dc557f09a3`.

Retained red.log records twelve genuine assertion failures with 87 passing controls, 99 total. Failures show successful canonical bytes/digests received where explicit refusal was independently expected; these are behavioral failures, without loader/setup/TypeError errors. The following green.log records 99/99. Full check.log records 706 tests/54 files, then successful build/harness/bundle/landing. Post-commit unchanged verify records 99/99. These are inspected implementer executions, not newly executed reviewer tests.

Exact registered verify remains:

`pnpm vitest run src/data/contracts/record-json.test.ts -t "record JSON preserves canonical authority"`

## Integration and limits

Root may proceed under its registered serialized flow: integrate the original loadable stub separately, combine the two reviewed fix commits into one complete final fix, verify both full source hashes against this target, then perform genuine final-fix-only inverse closure with all 99 tests retained. That inverse must restore the stub, fail by assertions and restore/check/verify green. Root alone records entry closure.

Previous review limits persist: no record-shape/reference/permission authority, recovery/claim engine, readiness/report publication consumer, provider CAS, semantic capability or browser acceptance is certified. The nine recovery fixtures remain unexecuted as journeys; hash assertions do not execute their events. Existing broader P2 findings remain outside this helper verdict. Any later behavioral change requires renewed review.
