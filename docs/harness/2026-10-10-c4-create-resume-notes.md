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
