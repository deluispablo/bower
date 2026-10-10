# create-property-time-dependent: a pending pile-folder create is resumed as a folder edit after a refresh

Diagnosis by Codex, read-only (TL-P4-29 ruling 3), on claude/p3, 2026-10-10. Tokens: input 664763 (cached 610688), output 4771.

The UTC date change exposed a product defect. The test also depends on wall-clock time, but its failing assertion matches the contract.

1. **Why does :4091 fail?** The retry succeeds after Bower itself renames the created folder.
   Observed: first name `2026-10-09 Dentist papers`; final name `2026-10-10 Dentist papers`.
   The folder remains `r1`, under the same parent; no outside change occurred.

2. **Why does Bower rename it?** After refresh, `updatePile` enters its existing-folder branch.
   It recomputes the name from the selected pile’s creation time, then sends a rename:
   `src/data/vault/drive-vault.ts:1104–1107`.

3. **Why does refresh select a different creation time?** The interrupted conversion leaves two Inbox entries
   carrying pile id `p4`: the original loose file and the newly created, still-empty folder.
   `piles()` uses each entry’s `createdTime` (:613, :682), sorts newest first (:696),
   and `pile(id)` selects the first match (:1437). Thus the new folder replaces the loose file as context.

4. **Why do their dates differ now?** The dentist fixture is twenty minutes old:
   `src/data/demo/fixture.ts:121`; seeding preserves that timestamp (`src/data/fake/seed.ts:90`).
   The new folder receives the fake Drive’s current timestamp (`src/data/drive/fake-drive.ts:465–468`).
   `pileFolderName` uses the UTC date (`src/data/piles.ts:32`).
   At 01:33 CEST, both timestamps were October 9 UTC. At 02:02 CEST, they straddled UTC midnight.
   This scenario is exposed during approximately the first twenty minutes of each UTC day.

5. **Why can the retry bypass the stored intent?** The reservation survives the lost answer and recovery read,
   but refresh changes the selected entry to a folder. That branch skips `intended.make` (:1099),
   recomputes its name, and treats the incomplete conversion as an ordinary folder edit.
   The pending conversion is therefore resumed from refreshed shape instead of its original intent.

**Proof:** All execution and modifications were confined to `/tmp/bower-date-diagnosis.Ds5489`.
The unmodified scratch copy reproduced seed `20261009`, path `"59"`, in 159 ms.
With the same source and dependencies, mocking `Date.now()` to `2026-10-09T23:33:00Z` passed all 800 trials.
Mocking it to `2026-10-10T00:02:00Z` failed at the same path in 160 ms.
`after-midnight.log` records the original/final names, rename send, and two `p4` rows.
Logs: `baseline.log`, `before-midnight.log`, `after-midnight.log`. Repository status remains clean.

**Contract verdict:** Product wrong against c4-create-landed addenda 10 and 16.
A pending create must be recovered against its stored name/place, without recomputing the name.
Addendum 15 does not authorize this bypass. The test’s success assertion should remain.
Its real clock is a reproducibility defect; the earlier pass also misses the incomplete conversion:
the empty folder and loose file can coexist without violating its name-only folder assertion.

**One home:** Reservation, stored intent and create landing belong to `src/data/spine/write-once.ts`
(:285–292, :312–340; architecture mechanism map :90). The bypass is its `updatePile` caller.

**(a) Fix inside the owner:** Small change: resume the pending pile-folder create through the existing
`Intended` holder before choosing ordinary folder-edit behavior; complete the original loose-file conversion.
Risk: medium—refresh, outside changes and partial moves need deterministic contract coverage.

**(b) Refactor first:** Medium change: extract pending pile conversion orchestration from `updatePile`,
retaining `write-once.ts` as the sole reservation/landing mechanism. Risk: higher regression surface
across conversion, rename, note creation and fences. No retry or weakened assertion is needed.

**Same class elsewhere:** Real-time seeding occurs in `src/data/vault/drive-vault.test.ts`
:34, :1387, :1462, :1612, :1714, :2433, :2457, :2705, :3778, :4038;
also `src/data/fake/fake-runner.test.ts:48`, `fake-worker.test.ts:45`, `write-it.test.ts:36`,
`src/data/vault/hashes.test.ts:15`, `src/data/live/home-cache.test.ts:47`,
and `src/data/contract/fake.contract.test.ts:11`. These are exposure sites, not proven failures.
Use fixed clocks plus explicit midnight cases; [Vitest documents date mocking](https://vitest.dev/api/vi#vi-setsystemtime).
