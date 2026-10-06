# Independent review R-disp-1: pile-disposition-authority

Reviewer: Claude subagent `disp-review-1` (read-only; implementer Codex). Target `/private/tmp/bower-p2-disposition`, base `6b04526` → stub `a3be1886` → tests `d123944f` → fix `a0791155bc45b80bcd00ea631d48be9d2579a603`. Contracts-2 / main `10ca886`, O3 C02/C12/C14, contract `aede6ef2…`.

**Verdict: CLEAN — 0 Critical, 0 Important, 3 Minor.**

Evidence: fixtures 01–09 match `packet-hashes.json`; the only disposition records are fixture 04 `legacy-01..15`, all 15 digests reproduced with an independent canonical encoder and read from the fixture by the test. Stub check 1060/56; red 44 genuine assertion failures / 239 controls of 283; green 283; check 1343/57 exit0; reviewer's own verify 283/283. Test file unchanged between tests and fix commits.

Substance verified: closed shapes at every level (unknown, own `__proto__`/`constructor` refused); missing vs null (only `declaration`, `content` nullable); guard-1 field rules incl. RFC3339 spelling preserved and leap-second at UTC month end; consumed ⇔ run authority; removed ⇔ person-bin with `trashed: true` on every operation; unique member keys, equal to caller-supplied set when given; `declaration: null` carries none; ≥1 operation, duplicate operation IDs refused; scope vs caller root; refusal returns no value/hash; digest errors propagate; identity = hash of whole decoded record. No rule invented beyond the contract; doc comments disclaim publication/effects/auth/Undo.

## Minor

1. `pile-disposition.test.ts:46`: `accept()` uses `toMatchObject` (same as declaration Minor 2); fixture tests use exact `toEqual`.
2. `pile-disposition.ts:140`: without caller `expectedMemberKeys`, a declared record with any unique subset (even none) is accepted. Matches packet ("when the caller supplies"); the consumer assignment must require the set whenever `declaration !== null`.
3. `pile-disposition.ts:135`: `driveId(expectedRootId)` is redundant (equality with validated `scope.rootId`); Gregorian century rule untested though handled.

Set aside: record-json behaviour (exponent sizes, BOM refusal, null prototype), copied validators (consolidation scheduled separately), guard-13 caller responsibilities.
