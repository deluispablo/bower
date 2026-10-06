# Independent review R-decl-1: pile-declaration-authority

Reviewer: Claude subagent `decl-review-1` (read-only, cross-tool; implementer was Codex). Assigned by coordinator `claude-orchestrator-2026-10-06-e759b272`. Contracts-2 / main `10ca886`, P2 O3, C02/C12/C14.

Target `/private/tmp/bower-p2-declaration-guards`, base `87cafb7c3317d0a15f2b1a41fe9802117c3fc920`, stub `b20c6187602a046746852cd145c67b9806e16b9a`, candidate `4052532b482e69f5945e19fc3aaba7f4fbbfff3d` (clean, reviewed by SHA). The reviewer did not run verify or `pnpm check`; counts below come from archived logs that were hash-verified.

**Verdict: CLEAN — 0 Critical, 0 Important, 3 Minor.**

## Evidence verification

- `contract.md` SHA256 `aede6ef26f21b894dfd9c169cd158c812534ed333b8f77c461105529fcaabdeb`; fixtures 01/06/07/08/09 match `packet-hashes.json` in integration and candidate trees.
- All 22 `manifest.json` entries (via `archive-path-map.json`) match by SHA256 and byte length.
- Committed module `3d083768…563a`, test `4d6f0429…78c1`, stub `ba10876d…9ce` equal their snapshots; `candidate.patch` equals `git diff 87cafb7 4052532`.
- Red logs 04/10: 90 failed / 240 passed of 330, every failure an AssertionError (no load/import errors), consistent with a stub that refuses everything as `shape`. Green logs 05/11/12: 330/330. Log 09: full check 1060 tests / 56 files, all gates pass. Intermediate lint/type failures preserved (06, 08).
- Tests were committed with the fix rather than separately; the packet only requires a separate loadable stub and reds on retained stub, which log 10 shows. Not a finding.

## Substance

Strict `parseRecordJson` first; closed exact key sets at every level (unknown fields including own `__proto__`/`constructor` refused); missing vs null distinct, only `member.origin` nullable; logical ID, hash, Drive ID (C0+DEL excluded, C1 allowed per ruling), single-component name and safe-integer rules; only `v:1`/`pile-declaration` accepted, legacy and other kinds refused. Unique member keys distinct from context key and folder createKey; loose exactly one member + absent context; folder member or nonempty originalText; present-empty context valid with members; context utf8 with raw TextEncoder size/SHA256, no trimming/normalization. Expected root supplied by caller, validated, never derived. Refusal returns no value and no source text; no try/catch, platform errors propagate. Identity via `hashRecordJson` of the whole record, no self-hash; independent decoded value, input bytes only read. No `any`; no auth/readiness/recovery claims.

Test power traced: each refusal mutates one field of an accepted base; removing any guard fails a test. Quoted-string hashing, normalization and trimming are caught by literal cases. Expected identities `6f4d484c…` (01), `a6433b2f…` (07), `b6e762ef…` (08, both 09 copies), `9bd97405…` (09 conflicting copy) appear verbatim in ratified fixtures and were reproduced by the reviewer's independent canonical encoder.

## Minor findings

1. `pile-declaration.test.ts:100` with `:105`: generated case titled "refuses null member.origin" actually calls `accept()`. Misleading name only; retitle "accepts null member.origin".
2. `pile-declaration.test.ts:58`: `accept()` uses `toMatchObject`, so boundary cases would not catch extra decoded fields. Fixture and conflicting-copy tests use exact `toEqual`. Suggest `toEqual({ ok: true, value, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })`.
3. `pile-declaration.test.ts:256`: legacy v1 refusal uses only a synthetic record and asserts no reason. Optional: add fixture 06 inputs and assert `shape`.

## Set aside

Context key equal to createKey is also refused (consistent with guard 4, disclosed and tested). Null-prototype decoded objects inherited from reviewed record-json. Fixture 09 wrong-root "conflict" vs parser `scope` refusal is later discovery/consumer mapping, excluded by the packet. Entry state and root inverse proof are root's.
