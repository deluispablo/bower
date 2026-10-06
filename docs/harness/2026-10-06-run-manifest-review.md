# Independent review R-man-1: run-manifest-authority

Reviewer: Codex `man-review-1` (read-only; implementer Claude `run-manifest-impl-1`). Raw session log: `/private/tmp/bower-p2-run-manifest-review/codex-review.log`. Final report verbatim:

**BLOCKED — 0 Critical, 2 Important, 6 Minor follow-ups.**

Independent reviewer `man-review-1` (Codex), `run-manifest-authority` / qa-22, P2 O3 C02/C12/C14. Planning: `2026-10-05-contracts-2`, main `10ca886`.

Reviewed immutable chain:

- Base: `6770d8f9e7a4c7bf6c2d93a4f2bcce5d1dcbe158`
- Stub: `1d8780a123905acd0fc11aad20a855169f717123`
- Tests: `be2a7582216a966b5545153d0907c89d1b9fe968`
- Fix: `c041f2c104318533752c2427264b9d70909fcbd0`

Checkout remained clean on `claude/p2-run-manifest`. Only the two assigned files changed. No edits, Git mutations, installations, network calls or full gates were performed.

**Important findings**

1. **Capture identity arrays permit duplicates** — [run-manifest.ts:153](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:153).  
   **Reproduced:** independently duplicate a fixture’s pile, member or place; alternatively add two journal entries with the same `recordId`. Recompute capture/operation identities and parse. All four variants return success.  
   **Effect:** ambiguous or repeated inventory receives validated manifest identity; downstream mapping/counting can disagree. Guard 1 and the packet’s common rules expressly prohibit duplicate identity arrays, so this belongs in Unit M now.  
   **Fix:** reject duplicate pile IDs, member file IDs, place file IDs and journal record IDs within their respective arrays. Add resealed negative tests, including conflicting bodies sharing an identity.

2. **Journal IDs are unbounded** — [run-manifest.ts:88](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:88).  
   **Reproduced:** a journal `recordId` containing 1 MiB of `x`, with recomputed identities, returns success.  
   **Effect:** the parser omits guard 1’s explicit “bounded text” requirement. The legacy parser also lacks a bound, but that does not satisfy the new contract.  
   **Fix:** obtain a concrete bound and measurement unit from the contract owner, preserve legacy punctuation, then enforce and test both boundaries. Do not invent a limit or silently equate “opaque” with “unbounded.”

**Minor findings and required follow-up classification**

These are nonblocking for this narrowly assigned slice, but must be registered before downstream acceptance.

| Item / location | Trigger, effect and evidence | Scope judgment and fix |
|---|---|---|
| RFC3339 — [line 105](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:105) | **Reproduced:** `2026-10-05T10:00:60Z` succeeds. Seconds `60` are accepted at arbitrary instants. The positive test at test line 350 also permits an invalid leap-second date. | Minor because timestamps are observations, not ordering authority. Validate leap-second placement/date and replace that positive control with a valid example. “Strict RFC3339” is currently overstated. |
| Captured context bytes — [line 130](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:130) | **Reproduced:** text inconsistent with captured size/hash succeeds. Version correspondence is also unchecked. | Guard 6 follow-up; Unit M expressly lists guard 1 and identity/structural checks. Validate exact UTF-8 bytes and version correspondence before capture acceptance. |
| Create/write text versus content — [line 178](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:178), line 182 | **Reproduced** for create-text; **reasoned** for write-runner-json: arbitrary text with inconsistent content succeeds. Tests explicitly accept blob create content. | Follow-up effect validation. Establish and enforce text encoding/size/hash consistency before dispatch. |
| Observed piles with non-null keys — [line 141](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:141) | **Reproduced:** change a declared source to observed while retaining its member keys; parsing succeeds. | Guard 6 follow-up. Enforce null keys for observed piles and corresponding captured members/context; avoid fabricated historical membership. |
| `createdBy` referencing a non-create operation — [line 246](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:246) | **Reproduced:** a new folder’s parent references an earlier move; parsing succeeds. | Unit M requires only earlier-operation resolution. Follow-up target validation must require an appropriate folder-create operation and eventual applied evidence. |
| Report grounding — [line 251](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:251) | **Reproduced:** change a contribution containing successful filed rows to `when: 'rejected'`; parsing succeeds. | Guard 9’s semantic grounding is explicitly outside this structural subset. Add effect/path/content/counter bindings and rejected-contribution restrictions before report materialization. |

Names as single components are correct under guard 1. Rejecting duplicate **non-null** member keys while allowing repeated nulls is also correct: null represents absent identity.

**Coverage and evidence**

The implementation correctly provides closed nested shapes, missing/null distinctions, caller-supplied scope comparison, refusal without a value, unexpected-error propagation, consecutive ordinals, earlier-only references, report operation references and unique question IDs. Both identity formulas match the contract. TypeScript is strict; no `any` types were introduced.

Contract SHA-256 matches `aede6ef26f21b894dfd9c169cd158c812534ed333b8f77c461105529fcaabdeb`. All nine fixture checksums match the contract ledger. All six literal expected hashes occur in those fixtures. Independent recomputation confirmed both manifest/capture digests and all 16 operations across fixtures 01 and 04.

The synthetic oracle uses its own canonical encoder and `node:crypto`, importing neither production hashing implementation. It is pinned to literal fixture digests. The test file is byte-identical between test and fix commits; no weakening, skips or focused-only tests were introduced.

| Supplied evidence | Verified recorded result |
|---|---|
| `stub-check.log` | 730 tests / 55 files; exit 0 |
| `red.log` | 248 failed / 999 passed; exit 1 |
| `green.log` | 1247 passed; exit 0 |
| `check.log` | 1977 tests / 56 files; exit 0 |

The red contains **247 AssertionError failures and one explicit “Synthetic manifest must parse” test throw**—not 248 AssertionErrors. There are no load/import failures.

The generated suite meaningfully exercises nested shapes and boundaries; exact refusal reasons prevent later identity checks from masking many missing shape checks. However, **1247 cases do not establish that every guard removal is caught**: 999 already pass against the refuse-all stub, and the two required omissions above lack tests. Exhaustive mutation coverage was not demonstrated.

My permitted Vitest rerun failed before collection because Vite attempted a prohibited temporary-file write. Reproductions above used the unchanged module transpiled in memory, with independently recomputed identities and no file writes; they are not a replacement full Vitest run.

**Set aside:** fixture runtime events, authentication/ancestry, readiness, provider evidence, claims, CAS, recovery, report publication, integration inverse proof and phase acceptance. The coordinator must resolve the two Important findings and obtain renewed review before closure.
**BLOCKED — 0 Critical, 2 Important, 6 Minor follow-ups.**

Independent reviewer `man-review-1` (Codex), `run-manifest-authority` / qa-22, P2 O3 C02/C12/C14. Planning: `2026-10-05-contracts-2`, main `10ca886`.

Reviewed immutable chain:

- Base: `6770d8f9e7a4c7bf6c2d93a4f2bcce5d1dcbe158`
- Stub: `1d8780a123905acd0fc11aad20a855169f717123`
- Tests: `be2a7582216a966b5545153d0907c89d1b9fe968`
- Fix: `c041f2c104318533752c2427264b9d70909fcbd0`

Checkout remained clean on `claude/p2-run-manifest`. Only the two assigned files changed. No edits, Git mutations, installations, network calls or full gates were performed.

**Important findings**

1. **Capture identity arrays permit duplicates** — [run-manifest.ts:153](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:153).  
   **Reproduced:** independently duplicate a fixture’s pile, member or place; alternatively add two journal entries with the same `recordId`. Recompute capture/operation identities and parse. All four variants return success.  
   **Effect:** ambiguous or repeated inventory receives validated manifest identity; downstream mapping/counting can disagree. Guard 1 and the packet’s common rules expressly prohibit duplicate identity arrays, so this belongs in Unit M now.  
   **Fix:** reject duplicate pile IDs, member file IDs, place file IDs and journal record IDs within their respective arrays. Add resealed negative tests, including conflicting bodies sharing an identity.

2. **Journal IDs are unbounded** — [run-manifest.ts:88](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:88).  
   **Reproduced:** a journal `recordId` containing 1 MiB of `x`, with recomputed identities, returns success.  
   **Effect:** the parser omits guard 1’s explicit “bounded text” requirement. The legacy parser also lacks a bound, but that does not satisfy the new contract.  
   **Fix:** obtain a concrete bound and measurement unit from the contract owner, preserve legacy punctuation, then enforce and test both boundaries. Do not invent a limit or silently equate “opaque” with “unbounded.”

**Minor findings and required follow-up classification**

These are nonblocking for this narrowly assigned slice, but must be registered before downstream acceptance.

| Item / location | Trigger, effect and evidence | Scope judgment and fix |
|---|---|---|
| RFC3339 — [line 105](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:105) | **Reproduced:** `2026-10-05T10:00:60Z` succeeds. Seconds `60` are accepted at arbitrary instants. The positive test at test line 350 also permits an invalid leap-second date. | Minor because timestamps are observations, not ordering authority. Validate leap-second placement/date and replace that positive control with a valid example. “Strict RFC3339” is currently overstated. |
| Captured context bytes — [line 130](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:130) | **Reproduced:** text inconsistent with captured size/hash succeeds. Version correspondence is also unchecked. | Guard 6 follow-up; Unit M expressly lists guard 1 and identity/structural checks. Validate exact UTF-8 bytes and version correspondence before capture acceptance. |
| Create/write text versus content — [line 178](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:178), line 182 | **Reproduced** for create-text; **reasoned** for write-runner-json: arbitrary text with inconsistent content succeeds. Tests explicitly accept blob create content. | Follow-up effect validation. Establish and enforce text encoding/size/hash consistency before dispatch. |
| Observed piles with non-null keys — [line 141](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:141) | **Reproduced:** change a declared source to observed while retaining its member keys; parsing succeeds. | Guard 6 follow-up. Enforce null keys for observed piles and corresponding captured members/context; avoid fabricated historical membership. |
| `createdBy` referencing a non-create operation — [line 246](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:246) | **Reproduced:** a new folder’s parent references an earlier move; parsing succeeds. | Unit M requires only earlier-operation resolution. Follow-up target validation must require an appropriate folder-create operation and eventual applied evidence. |
| Report grounding — [line 251](/private/tmp/bower-p2-run-manifest/src/data/contracts/run-manifest.ts:251) | **Reproduced:** change a contribution containing successful filed rows to `when: 'rejected'`; parsing succeeds. | Guard 9’s semantic grounding is explicitly outside this structural subset. Add effect/path/content/counter bindings and rejected-contribution restrictions before report materialization. |

Names as single components are correct under guard 1. Rejecting duplicate **non-null** member keys while allowing repeated nulls is also correct: null represents absent identity.

**Coverage and evidence**

The implementation correctly provides closed nested shapes, missing/null distinctions, caller-supplied scope comparison, refusal without a value, unexpected-error propagation, consecutive ordinals, earlier-only references, report operation references and unique question IDs. Both identity formulas match the contract. TypeScript is strict; no `any` types were introduced.

Contract SHA-256 matches `aede6ef26f21b894dfd9c169cd158c812534ed333b8f77c461105529fcaabdeb`. All nine fixture checksums match the contract ledger. All six literal expected hashes occur in those fixtures. Independent recomputation confirmed both manifest/capture digests and all 16 operations across fixtures 01 and 04.

The synthetic oracle uses its own canonical encoder and `node:crypto`, importing neither production hashing implementation. It is pinned to literal fixture digests. The test file is byte-identical between test and fix commits; no weakening, skips or focused-only tests were introduced.

| Supplied evidence | Verified recorded result |
|---|---|
| `stub-check.log` | 730 tests / 55 files; exit 0 |
| `red.log` | 248 failed / 999 passed; exit 1 |
| `green.log` | 1247 passed; exit 0 |
| `check.log` | 1977 tests / 56 files; exit 0 |

The red contains **247 AssertionError failures and one explicit “Synthetic manifest must parse” test throw**—not 248 AssertionErrors. There are no load/import failures.

The generated suite meaningfully exercises nested shapes and boundaries; exact refusal reasons prevent later identity checks from masking many missing shape checks. However, **1247 cases do not establish that every guard removal is caught**: 999 already pass against the refuse-all stub, and the two required omissions above lack tests. Exhaustive mutation coverage was not demonstrated.

My permitted Vitest rerun failed before collection because Vite attempted a prohibited temporary-file write. Reproductions above used the unchanged module transpiled in memory, with independently recomputed identities and no file writes; they are not a replacement full Vitest run.

**Set aside:** fixture runtime events, authentication/ancestry, readiness, provider evidence, claims, CAS, recovery, report publication, integration inverse proof and phase acceptance. The coordinator must resolve the two Important findings and obtain renewed review before closure.
exit=0

## Coordinator rulings (2026-10-06)

- Finding 1: in scope now. Refuse duplicate `pileId` in `capture.piles`, duplicate `file.fileId` in `capture.members` and in `capture.places`, duplicate `recordId` in `capture.journal`.
- Finding 2: the contract requires "bounded" but gives no number. Coordinator applies the contract's existing bound for opaque identifiers, the DriveId rule: at most 1024 UTF-8 bytes, nonempty, control-free, punctuation preserved. Recorded for technical-lead ratification; a different ratified bound would be a one-line follow-up.
- Fix the RFC3339 leap-second Minor in the same rework (seconds 60 only at 23:59:60 on a UTC month end, as the disposition sibling does) and replace the invalid positive control.
- Remaining Minors (guard 6 context/effect text-content consistency, observed piles with non-null keys, createdBy target kind, guard 9 report grounding) are registered follow-ups before any consumer depends on them; not part of this entry.
