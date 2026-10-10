# c4-create-resume implementation

Scope: TL-P4-24 addendum 17 and the assigned packet. The coordinator owns the fix and notes commits.
No git write command, network, pnpm check or e2e was run. No contracts or features were changed;
no compatibility: 03259005 row is required. No assertion, property bound, seed or pin was changed.

## Fix

- src/data/vault/drive-vault.ts:115: extend the existing Intended holder with the original loose DriveFile read.
  This is conversion context on the same holder, not another reservation store or landing mechanism.
- src/data/vault/drive-vault.ts:1066: look up that holder before folder-edit selection. A refresh can select the
  half-made folder, but a pending conversion still uses its original loose file and original name/place fence.
- src/data/vault/drive-vault.ts:1101: use the holder's stored Sent before calculating any fresh folder name.
  Keep the loose read on that holder before the first create. Intended.make and makeFolder still perform
  reservation, resend, recovery and landed checks in src/data/spine/write-once.ts, unchanged.
- src/data/vault/drive-vault.ts:1104: use the confirmed folder's name and id, then finish the original loose-file
  move through the existing stamped, fenced once call. The half-made folder never enters the rename branch.
  A recovered folder moved, renamed or binned elsewhere is still refused by write-once's asMade.

Fix files (one fix commit):

- src/data/vault/drive-vault.ts
- src/data/vault/drive-vault.test.ts
- src/data/fake/fake-runner.test.ts
- src/data/fake/fake-worker.test.ts
- src/data/fake/write-it.test.ts
- src/data/vault/hashes.test.ts
- src/data/live/home-cache.test.ts
- src/data/contract/fake.contract.test.ts

Notes file (separate notes commit): docs/harness/2026-10-10-c4-create-resume-notes.md.

## Research

No network was used. The installed Vitest API documentation, node_modules/vitest/dist/index.d.ts:485,
says setSystemTime mocks Date calls without enabling fake timers. Use its fixed clock for fixture creation,
with useRealTimers cleanup; preserve home-cache's existing virtual timer model.
Reference: [Vitest setSystemTime](https://vitest.dev/api/vi#vi-setsystemtime), cited from the installed API,
not fetched. The existing write-once.ts mechanism's documented standard is to retry with the same idempotency
key and first intent: [Stripe idempotent requests](https://stripe.com/docs/api/idempotent_requests).
The local implementation reused is Intended.holder/keep/make plus makeOnce/asMade; no second mechanism.

## Tests and removals

All newly fixed shared clocks start at 2026-10-10T12:00:00Z. Hooks cover re-seeding in helpers and property trials.
The independently committed midnight red and create property's bodies remain byte-for-byte identical to HEAD.
They retain their own 2026-10-10T00:02:00Z pin, seed 20261009 and 800 trials.
Line references below refer to the final working tree; packet references are given where they differ.

tests changed: src/data/vault/drive-vault.test.ts:35: shared default fixture (packet :34) and its callers now seed under vi.setSystemTime; cleanup restores Date; assertions unchanged.
tests changed: src/data/vault/drive-vault.test.ts:1390: fresh upload-page fixture (packet :1387) now uses the shared fixed clock; assertions unchanged.
tests changed: src/data/vault/drive-vault.test.ts:1465: leaving Bower removes the bytes this device kept (packet :1462), backend seed now fixed; assertions unchanged.
tests changed: src/data/vault/drive-vault.test.ts:1615: every upload goes through the queue (packet :1612), backend seed now fixed; assertions unchanged.
tests changed: src/data/vault/drive-vault.test.ts:1717: coming back online retries only connection failures (packet :1714), backend seed now fixed; assertions unchanged.
tests changed: src/data/vault/drive-vault.test.ts:2436: storage notice while sending cases (packet :2433), seed now fixed; assertions unchanged.
tests changed: src/data/vault/drive-vault.test.ts:2460: storage notice while a failed upload awaits retry cases (packet :2457), seed now fixed; assertions unchanged.
tests changed: src/data/vault/drive-vault.test.ts:2708: lost local bytes chosen again through the queue (packet :2705), seed now fixed; assertions unchanged.
tests changed: src/data/vault/drive-vault.test.ts:3781: every app write property (packet :3778), every trial seeds under the shared fixed clock; assertions unchanged.

Packet :4038 is the existing create property, now at :3984 with operative seed :4068. Its fixed clock was
already committed by the red-owning session (see /tmp/resume-red-notes.md); this implementation did not
change its body or pin. The new midnight red also re-seeds under its own unchanged pin.

tests changed: src/data/fake/fake-runner.test.ts:49: shared seed (packet :48) and its callers now use a fixed Date; cleanup restores Date; assertions unchanged.
tests changed: src/data/fake/fake-worker.test.ts:46: world fixture (packet :45) and its callers now seed under a shared fixed Date; existing cleanup restores Date; assertions unchanged.
tests changed: src/data/fake/fake-worker.test.ts:210: reload during filing, direct seed now fixed by the same hook; assertions unchanged.
tests changed: src/data/fake/fake-worker.test.ts:226: running situation starts only on a fresh Drive, direct seed now fixed; assertions unchanged.
tests changed: src/data/fake/fake-worker.test.ts:254: savedRun helper and callers, direct seed now fixed; assertions unchanged.
tests changed: src/data/fake/fake-worker.test.ts:400: cut-off saving run after reload, direct seed now fixed; assertions unchanged.
tests changed: src/data/fake/fake-worker.test.ts:620: failed tidy-up retry within demo pace, direct seed now fixed; assertions unchanged.
tests changed: src/data/fake/fake-worker.test.ts:5426: recoverable running situation, direct seed now fixed; assertions unchanged.
tests changed: src/data/fake/fake-worker.test.ts:5483: every tidy-up plan takes the recoverable path, direct seed now fixed; assertions unchanged.
tests changed: src/data/fake/fake-worker.test.ts:2189: a rule is worded once through a recoverable operation, advance the fixed clock by 2 ms between rules instead of a real wait; preserve newest-first assertion.
tests changed: src/data/fake/fake-worker.test.ts:2253: counts a rule taken out and a rule already there as none of your changes, advance the fixed clock by 2 ms between rules instead of a real wait; assertions unchanged.
tests changed: src/data/fake/write-it.test.ts:37: shared write-it seed (packet :36) and callers now use fixed Date with cleanup; assertions unchanged.
tests changed: src/data/vault/hashes.test.ts:18: duplicate lookup fixture (packet :15) now seeds under fixed Date with cleanup; assertions unchanged.
tests changed: src/data/live/home-cache.test.ts:48: slowReport fixture (packet :47) now seeds under a fixed start for its existing fake timers; assertions unchanged.
tests changed: src/data/contract/fake.contract.test.ts:15: fake Drive contract fixture (packet :11) and callers now use fixed Date with cleanup; assertions unchanged.

removed: src/data/vault/drive-vault.ts:1097 (old): unconditional recomputation of the pending folder's name and temporary parent variable; stored Sent is preferred.
removed: src/data/vault/drive-vault.ts:1066 (old): relying only on refreshed pile shape to choose the conversion's file; original loose read comes from the holder.
removed: src/data/fake/fake-worker.test.ts:2189: real 2 ms chronological wait, replaced by a 2 ms fixed-clock advance.
removed: src/data/fake/fake-worker.test.ts:2253: real 2 ms chronological wait, replaced by a 2 ms fixed-clock advance.
removed: no tests, assertions, reservation mechanism, landing mechanism or contract thresholds.

The first full data run exposed a tied timestamp in the newest-first rules assertion after Date became fixed.
Replacing the two chronological waits with explicit clock advances preserves their original intent and assertions.

## Evidence and logs

Before the fix:
`pnpm exec vitest run src/data/vault/drive-vault.test.ts -t 'keeps its first name|every app create, its answer lost' > /tmp/resume-before.log 2>&1`
Exit 1: both reds failed on assertions. The folder changed from 2026-10-09 Dentist papers to
2026-10-10 Dentist papers; the create property failed after 60 trials at seed 20261009, path 59,
counterexample [pile folder, none, after a refresh, before the retry].

After the fix, the identical selected command with /tmp/resume-red-green.log exited 0: both reds pass.
A read-only comparison against HEAD verified the entire midnight red and create property bodies were unchanged.
The full data run below also covers both reds, drive-vault, journal and write-once.

- `pnpm exec tsc -p tsconfig.app.json > /tmp/resume-tsc.log 2>&1`: exit 0.
- `pnpm exec vitest run src/data > /tmp/resume-unit.log 2>&1`: exit 0.
- `pnpm -C runner exec vitest run > /tmp/resume-runner.log 2>&1`: exit 0.
  Runner golden assertions remain exactly 78 and 88 in runner/test/drive-calls-golden.test.ts; file unchanged.

Only failure sections of test logs were read. pnpm check and e2e were excluded by the owner's explicit instruction.

## Round 2

The independent red is committed at HEAD, 34bf7baf. The adversarial report was absent from this worktree;
the named report was read from /Users/deluisp/Projects/bower-app/docs/harness/2026-10-10-codex-c4-create-resume-adversarial.md.

- src/data/spine/write-once.ts:339: Intended.make accepts an optional completion step. It awaits that step
  at :344 before deleting the existing holder at :345. A failed completion leaves the same reserved id,
  first Sent and caller context on that holder; makeOnce still releases a refused create as before.
- src/data/vault/drive-vault.ts:1103: updatePile supplies the original loose-file move as that completion step.
  Its existing stamped, fenced once call at :1107 confirms the move before the conversion holder is forgotten.
  A retry after a failed move therefore recovers the same folder through makeFolder and asMade, using its
  first name and loose-file read, rather than selecting the folder-edit branch. Note creation follows after
  the conversion is complete. No new reservation store or landing question was added.

tests changed: none

Standard solution reused: the local write-once.ts documentation (:2-24) cites
[Stripe idempotent requests](https://stripe.com/docs/api/idempotent_requests): retry with the same key
and first intent. No network research was performed. This round extends the existing holder's lifetime
through the conversion's completion and uses the existing create and move landing checks unchanged.

Before the fix:
`pnpm exec vitest run src/data/vault/drive-vault.test.ts -t 'a pile-folder conversion whose file move failed after the folder landed keeps its first name and finishes' > /tmp/resume-r2-red.log 2>&1`
Exit 1 on the assertion at drive-vault.test.ts:3999: the folder was renamed from 2026-10-09 Dentist papers
to 2026-10-10 Dentist papers, and the loose file remained outside it. The test was not changed.

After the fix:

- `pnpm exec tsc -p tsconfig.app.json > /tmp/resume-r2-tsc.log 2>&1`: exit 0.
- `pnpm exec vitest run src/data > /tmp/resume-r2-unit.log 2>&1`: exit 0, including the unchanged round-2 red,
  midnight red, create property, drive-vault, journal and write-once suites.
- `pnpm -C runner exec vitest run > /tmp/resume-r2-runner.log 2>&1`: exit 0.
  The unchanged runner/test/drive-calls-golden.test.ts asserts exactly 78 (:21, :23) and 88 (:69).

No tests, goldens or contract numbers were changed. No git write command, network, pnpm check or e2e was run.
The coordinator owns the separate fix and notes commits. Fix files: src/data/spine/write-once.ts and
src/data/vault/drive-vault.ts. Notes file: this file. No stored format changed; existing holders and callers
without a completion step retain their existing behavior.

## Addendum 18 re-plan red

Added one six-row `it.each` table in src/data/vault/drive-vault.test.ts:
`a pile conversion interrupted at any step resumes there and keeps its first names`.
Each step lands before its answer and its recovery read are lost. The same vault refreshes and retries.
Clocks are fixed with vi.setSystemTime, and the seed is 20 minutes older than each clock.
The final assertion checks the original folder id and name, the moved loose file, one note with its words
and first id when already landed, zero renames, one folder-create send, one note-create send and one move.

| Interrupted step | 2026-10-09T23:59:00Z | 2026-10-10T00:02:00Z |
| --- | --- | --- |
| Folder create | FAIL: two folder-create sends | FAIL: two folder-create sends |
| Loose-file move | FAIL: two folder-create sends | FAIL: two folder-create sends |
| Note create | PASS | FAIL: folder name changes and a rename is sent |

Verification:
- Requested targeted vitest command: exit 1, five assertion failures, one pass; /tmp/resume-a18-red.log.
- pnpm exec eslint src/data/vault/drive-vault.test.ts: exit 0; /tmp/resume-a18-eslint.log.
- pnpm exec tsc -b --noEmit: exit 0; /tmp/resume-a18-tsc.log.
- git diff --check: exit 0 (read-only).

tests changed: none (one new table only).
Standard solution: the lead's TL-P4-24 addendum 18 one-intent saga ruling and the existing write-once home,
which cites https://stripe.com/docs/api/idempotent_requests for keeping the first intent with its key.
No network, git write, production change, pnpm check or e2e. The coordinator owns commits.
Compatibility: tests and notes only; no stored format or runtime behavior changed.
Status: red delivered; addendum 18 implementation remains for the fresh implementation session.

## Re-plan (addendum 18)

The fix is in src/data/spine/write-once.ts and src/data/vault/drive-vault.ts. The coordinator owns
the fix commit, then this notes commit. No git write command, network, pnpm check or e2e was run.

Intent shape and home:

- src/data/spine/write-once.ts:308: Conversion keeps the original loose DriveFile, first text and folder
  properties, folder and note holders with reserved ids and first Sent values, and the landed folder,
  moved file and note. The note name is chosen with the folder name before any conversion send.
- src/data/spine/write-once.ts:332: the conversion is one entry in Intended's existing held map,
  keyed by pile-conversion:<pile id>. There is no separate conversion map or reservation mechanism.
- src/data/spine/write-once.ts:379: Intended.convert owns reservation, recovery and progress for all
  three steps. reserveFor reserves both ids at :388; the note's first place is that reserved folder id.
  Fresh names and words are evaluated only once, by the first-start factory.
- src/data/vault/drive-vault.ts:1066: updatePile finds the pending conversion before folder-edit selection.
  Its original loose file supplies the move fence, even when refresh lists the half-made folder instead.
  The conversion's result updates the index only after all three steps are confirmed.

Resume order:

1. Folder (:392-395): madeAt reads by the folder's reserved id and checks its first name/place, including
   the Bin. A found folder is used without a create send. An already confirmed folder is checked again
   before further effects; if it disappeared, it is refused rather than created again.
2. Loose-file move (:396): skip a confirmed move. An interrupted move uses the original read with the
   existing stamped, fenced DriveVault.once call (drive-vault.ts:1087). That call recognizes an already
   landed move and sends no second update. Name/place changes elsewhere remain refusals.
3. Note (:397-398): madeAt reads by the note's reserved id, checking first name/place and first words.
   A found note is used without a create send; otherwise makeText sends the same reserved id and intent.
4. Completion (:399): forget the whole intent only after the folder, move and note have landed.
   Unknown outcomes, lost recovery reads and transient failures retain both ids, first names and progress.

Compatibility: the existing terminal-refusal rule remains in force (:402-403, reusing releases at :276).
A conversion permanently refused because its folder changed elsewhere ends on that refusal, with nothing
sent into the changed folder. A later press may start a new intent, as the unchanged existing test
`a pile folder whose create landed and then moved is refused on retry` requires at drive-vault.test.ts:3913.
The first full data run exposed this compatibility requirement; preserving the existing rule made it green.
Ordinary pile-note edits and retries in already-existing folders retain their original behavior and keeper.
No stored device format changed: this intent lives in the existing page-memory port and survives refresh().

removed: src/data/vault/drive-vault.ts:115: Holder & { loose?: DriveFile } conversion context on a per-create holder.
removed: src/data/vault/drive-vault.ts (old :1066-1074): pile-folder key and per-folder pending/kept branching.
removed: src/data/vault/drive-vault.ts (old :1092-1109): per-step folder holder, completion callback and early release.
removed: src/data/spine/write-once.ts (old :335-344): Intended.make's optional finish callback and its await.
removed: no tests, goldens, contract numbers or ordinary existing-folder pile-note retry logic.

tests changed: none

Research: reused the existing write-once home and the lead's one-intent saga ruling, with the local
write-once.ts:2-24 references to [Stripe idempotent requests](https://stripe.com/docs/api/idempotent_requests)
and RFC 9110 sections 9.2.2 and 13.1.1. Reservation, create landing and move landing remain reserveFor,
madeAt/makeFolder/makeText and DriveVault.once/updateByStamp; no second landing check was introduced.
No network research was performed.

Evidence and logs:

- Before the fix, the unchanged six-row table had five assertion failures and one pass:
  `pnpm exec vitest run src/data/vault/drive-vault.test.ts -t 'a pile conversion interrupted at any step resumes there and keeps its first names' > /tmp/resume-a18-before.log 2>&1`.
  Folder/move rows sent two folder creates; the midnight note row renamed the folder.
- After the re-plan, the same targeted table passed, exit 0: /tmp/resume-a18-red-green.log.
  The final full data run also passes all six unchanged rows, the earlier midnight/move reds and the create property.
- `pnpm exec tsc -p tsconfig.app.json > /tmp/resume-a18-tsc.log 2>&1`: final exit 0.
- `pnpm exec vitest run src/data > /tmp/resume-a18-unit.log 2>&1`: final exit 0.
- `pnpm -C runner exec vitest run > /tmp/resume-a18-runner.log 2>&1`: exit 0.
  runner/test/drive-calls-golden.test.ts is unchanged and asserts exactly 78 (:21, :23) and 88 (:69).
- Read-only git diff --check: exit 0. Only failure sections of test logs were read.

Status: implementation and the requested local runs are green; coordinator commits and independent review remain.
