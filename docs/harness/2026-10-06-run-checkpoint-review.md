# Independent review R-chk-1: run-checkpoint-authority

Reviewer: Codex `chk-review-1` (read-only; implementer Claude `run-checkpoint-impl-1`). Raw session log: `/private/tmp/bower-p2-run-checkpoint-review/codex-review.log`. Final report verbatim:

**BLOCKED — 0 Critical, 2 Important, 1 Minor.**

Independent reviewer `chk-review-1`; entry `run-checkpoint-authority` (qa-22), P2 O3, C02/C12/C14. Planning revision `2026-10-05-contracts-2`, main `10ca886`.

Reviewed immutable sequence:

- Base: `6770d8f9e7a4c7bf6c2d93a4f2bcce5d1dcbe158`
- Stub: `2ae3b3c535f3c815cac9aeed90286088e63415c5`
- Tests: `6bebc988e9011ee5395d8f823913e13bf955d24f`
- Fix/target: `6881668ab44abad0cb08c19bbac38e2b82c0aa33`

Only the two assigned paths changed. Both working files match the target commit; checkout remains clean.

**Findings**

1. **Important — `failed` accepts applied effects without a report.** [run-checkpoint.ts:215](/private/tmp/bower-p2-run-checkpoint/src/data/contracts/run-checkpoint.ts:215)  
   **Trigger:** Take fixture 02’s `checkpoint2`, retain its applied outcome and `report: { state: 'not-ready' }`, and change only `phase` to `failed`.  
   **Effect:** Both parsing and verification of `[checkpoint0, checkpoint1, modifiedCheckpoint2]` succeed. This permits terminal failure before result publication, contrary to guards 10/12’s recoverable-result requirement. Checking only `possible-effect` and explicit `pending` misses the interval before the first pending checkpoint.  
   **Evidence:** Reproduced using the unchanged source transpiled and executed entirely in memory.  
   **Fix:** Refuse `failed` when applied outcomes still lack published result evidence; add the first-pending-checkpoint-failure regression. Applied outcomes must block failure at least while the report is `not-ready` or `pending`.

2. **Important — repeated before-effect refusal has an unratified immutability restriction.** [run-checkpoint.ts:256](/private/tmp/bower-p2-run-checkpoint/src/data/contracts/run-checkpoint.ts:256)  
   **Trigger:** Link two otherwise valid `before-effect-refused` checkpoints for the same operation; change the second failure from `offline` to `auth` after another pre-dispatch refusal.  
   **Effect:** Both records parse, but chain verification refuses the second with `transition`. Guard 8 permits retry after authority/precondition checks and explicitly freezes applied/rejected evidence; it does not freeze a nonterminal refusal’s diagnostics. This policy can prevent recording another proven no-effect refusal.  
   **Evidence:** Reproduced rejection; the contract-policy objection is reasoned from guard 8 and the packet’s instruction to return ambiguities.  
   **Fix:** Resolve this restriction against the contract before acceptance. Permit updated failure details for a separately proven pre-dispatch refusal, or obtain an explicit ruling requiring immutable refusal details; cover the chosen behavior with tests.

3. **Minor — positive helper permits extra decoded fields and sometimes compares the digest with itself.** [run-checkpoint.test.ts:104](/private/tmp/bower-p2-run-checkpoint/src/data/contracts/run-checkpoint.test.ts:104)  
   **Trigger:** An implementation returns additional decoded fields, or an incorrect well-formed digest for a synthetic positive case without an expected digest.  
   **Effect:** `toMatchObject` and `digest ?? result.sha256` can miss that regression. Literal fixture digest checks remain meaningful.  
   **Evidence:** Reasoned test-coverage gap; no current production failure claimed.  
   **Fix:** Compare the complete result exactly and independently calculate expected synthetic digests through `hashRecordJson`.

**Evidence results**

| Evidence | Verified result |
|---|---|
| `stub-check.log` | 730 tests / 55 files; recorded exit 0 |
| `red.log` | 79 failed / 69 passed; exit 1. All 79 failure headings belong to 38 shared AssertionError blocks; no load/import failure |
| `green.log` | 148 passed; recorded exit 0 |
| `check.log` | 878 tests / 56 files; complete check recorded exit 0 |
| Independent named rerun | Blocked before test loading: Vite’s temporary config write received `EPERM` |
| Independent focused probes | In-memory only; reproduced findings 1 and 2 |

The test file is byte-identical between test and fix commits: no test weakening. All ten packet hashes match, including contract SHA256 `aede6ef26f21b894dfd9c169cd158c812534ed333b8f77c461105529fcaabdeb`. Every literal expected digest was found in the fixtures and independently recomputed, including all 31 fixture-04 chain records. Synthetic predecessor links use `hashRecordJson`.

The reported blank-line deletion is semantically harmless. No pre-deletion source snapshot accompanies the four logs, so its exact historical byte difference cannot be independently certified.

**Coverage and contract decisions**

Closed shapes, required versus nullable fields, strict JSON, field guards, ordered one-per-operation outcomes, revision/previous linkage, unchanged scope/run/manifest, terminal applied/rejected evidence, pending-body hashing/binding, refusal without value, and platform-error propagation were inspected. No `any`, skipped tests, or focused-only tests were found.

Caller-supplied `runId`/`captureId`, refusal → possible-effect/rejected, revision-zero chain origin, duplicate-question refusal, and pending-binding reason `report` are justified. Remaining possible-effect with unchanged dispatch identity is justified; equality is **canonical equality**, not raw JSON byte equality. Freezing before-effect-refused details and the incomplete failed-phase check are the findings above.

Set aside: actual effect/provenance verification, report-plan grounding and publication, trusted head selection, service claims, runtime recovery, CAS, browser/provider behavior, and coordinator inverse/entry closure. These remain outside this pure-schema review; fixture events remain **NOT EXECUTED**.
tokens used
102,338
**BLOCKED — 0 Critical, 2 Important, 1 Minor.**

Independent reviewer `chk-review-1`; entry `run-checkpoint-authority` (qa-22), P2 O3, C02/C12/C14. Planning revision `2026-10-05-contracts-2`, main `10ca886`.

Reviewed immutable sequence:

- Base: `6770d8f9e7a4c7bf6c2d93a4f2bcce5d1dcbe158`
- Stub: `2ae3b3c535f3c815cac9aeed90286088e63415c5`
- Tests: `6bebc988e9011ee5395d8f823913e13bf955d24f`
- Fix/target: `6881668ab44abad0cb08c19bbac38e2b82c0aa33`

Only the two assigned paths changed. Both working files match the target commit; checkout remains clean.

**Findings**

1. **Important — `failed` accepts applied effects without a report.** [run-checkpoint.ts:215](/private/tmp/bower-p2-run-checkpoint/src/data/contracts/run-checkpoint.ts:215)  
   **Trigger:** Take fixture 02’s `checkpoint2`, retain its applied outcome and `report: { state: 'not-ready' }`, and change only `phase` to `failed`.  
   **Effect:** Both parsing and verification of `[checkpoint0, checkpoint1, modifiedCheckpoint2]` succeed. This permits terminal failure before result publication, contrary to guards 10/12’s recoverable-result requirement. Checking only `possible-effect` and explicit `pending` misses the interval before the first pending checkpoint.  
   **Evidence:** Reproduced using the unchanged source transpiled and executed entirely in memory.  
   **Fix:** Refuse `failed` when applied outcomes still lack published result evidence; add the first-pending-checkpoint-failure regression. Applied outcomes must block failure at least while the report is `not-ready` or `pending`.

2. **Important — repeated before-effect refusal has an unratified immutability restriction.** [run-checkpoint.ts:256](/private/tmp/bower-p2-run-checkpoint/src/data/contracts/run-checkpoint.ts:256)  
   **Trigger:** Link two otherwise valid `before-effect-refused` checkpoints for the same operation; change the second failure from `offline` to `auth` after another pre-dispatch refusal.  
   **Effect:** Both records parse, but chain verification refuses the second with `transition`. Guard 8 permits retry after authority/precondition checks and explicitly freezes applied/rejected evidence; it does not freeze a nonterminal refusal’s diagnostics. This policy can prevent recording another proven no-effect refusal.  
   **Evidence:** Reproduced rejection; the contract-policy objection is reasoned from guard 8 and the packet’s instruction to return ambiguities.  
   **Fix:** Resolve this restriction against the contract before acceptance. Permit updated failure details for a separately proven pre-dispatch refusal, or obtain an explicit ruling requiring immutable refusal details; cover the chosen behavior with tests.

3. **Minor — positive helper permits extra decoded fields and sometimes compares the digest with itself.** [run-checkpoint.test.ts:104](/private/tmp/bower-p2-run-checkpoint/src/data/contracts/run-checkpoint.test.ts:104)  
   **Trigger:** An implementation returns additional decoded fields, or an incorrect well-formed digest for a synthetic positive case without an expected digest.  
   **Effect:** `toMatchObject` and `digest ?? result.sha256` can miss that regression. Literal fixture digest checks remain meaningful.  
   **Evidence:** Reasoned test-coverage gap; no current production failure claimed.  
   **Fix:** Compare the complete result exactly and independently calculate expected synthetic digests through `hashRecordJson`.

**Evidence results**

| Evidence | Verified result |
|---|---|
| `stub-check.log` | 730 tests / 55 files; recorded exit 0 |
| `red.log` | 79 failed / 69 passed; exit 1. All 79 failure headings belong to 38 shared AssertionError blocks; no load/import failure |
| `green.log` | 148 passed; recorded exit 0 |
| `check.log` | 878 tests / 56 files; complete check recorded exit 0 |
| Independent named rerun | Blocked before test loading: Vite’s temporary config write received `EPERM` |
| Independent focused probes | In-memory only; reproduced findings 1 and 2 |

The test file is byte-identical between test and fix commits: no test weakening. All ten packet hashes match, including contract SHA256 `aede6ef26f21b894dfd9c169cd158c812534ed333b8f77c461105529fcaabdeb`. Every literal expected digest was found in the fixtures and independently recomputed, including all 31 fixture-04 chain records. Synthetic predecessor links use `hashRecordJson`.

The reported blank-line deletion is semantically harmless. No pre-deletion source snapshot accompanies the four logs, so its exact historical byte difference cannot be independently certified.

**Coverage and contract decisions**

Closed shapes, required versus nullable fields, strict JSON, field guards, ordered one-per-operation outcomes, revision/previous linkage, unchanged scope/run/manifest, terminal applied/rejected evidence, pending-body hashing/binding, refusal without value, and platform-error propagation were inspected. No `any`, skipped tests, or focused-only tests were found.

Caller-supplied `runId`/`captureId`, refusal → possible-effect/rejected, revision-zero chain origin, duplicate-question refusal, and pending-binding reason `report` are justified. Remaining possible-effect with unchanged dispatch identity is justified; equality is **canonical equality**, not raw JSON byte equality. Freezing before-effect-refused details and the incomplete failed-phase check are the findings above.

Set aside: actual effect/provenance verification, report-plan grounding and publication, trusted head selection, service claims, runtime recovery, CAS, browser/provider behavior, and coordinator inverse/entry closure. These remain outside this pure-schema review; fixture events remain **NOT EXECUTED**.

## Coordinator rulings (2026-10-06)

- Finding 1: guard 12 allows `failed` only when no possibly applied effect remains; refuse `failed` whenever any outcome is `applied` or `possible-effect`, or the report is `pending`.
- Finding 2: guard 8 freezes only applied/rejected evidence; a later proven pre-dispatch refusal may record different failure details (`before-effect-refused` → `before-effect-refused` with any valid failure). No invented immutability.
- Finding 3: fix test helper to exact `toEqual` and independent `hashRecordJson` digests for synthetic positives.

## Delta review R-chk-2 (fresh Claude `chk-review-2`; Codex unavailable)

Range `6881668` → rework test `e5ab68a` → rework fix `1f95721`. **Verdict: CLEAN — 0 Critical, 0 Important, 0 Minor.** Only the two paths changed across the whole range; no `any`/`.only`/`.skip`. Single `honestPhase` check (`run-checkpoint.ts:197-206`) used in parse and every chain record: `failed` refused with any applied/possible-effect outcome or pending report; `done` requires all applied/rejected and published report. `before-effect-refused` → `before-effect-refused` with new failure allowed (`:264-265`); applied/rejected frozen by canonical identity; possible-effect stays only with the same dispatchId. Test helper exact `toEqual` with independent `hashRecordJson` digests; no assertion weakened (6bebc98..e5ab68a). Evidence: rework red 3 genuine assertion failures, green 151, check 881/56; reviewer's verify 151. Probes reproduced on both revisions (fixture 02 checkpoint2→failed refused at 1f95721; offline→auth refusal chain accepted; revision-zero done with nothing dispatched refused).

Set aside (new policy, not graded): chain does not enforce monotonic phase or report-state transitions (failed→writing, published→not-ready accepted). Needs a contract ruling before a later unit.
