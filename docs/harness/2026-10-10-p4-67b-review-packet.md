# Packet: P4-67b delta review (c4-undo-compensate gate fixes after the P4-67 PASS)

This review is read-only and fresh. Run unit tests only; never start a server, run e2e, or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-compensate`.

## What to review

- **Delta:** `git diff 44d9045c..958971be -- src docs/harness/2026-10-09-c4-undo-compensate-notes.md`. It holds three gate fixes plus merges of claude/p3, which bring in c4-create-resume:
  - 59965218: "expected:" comments at journal.ts:265 and :347, for the architecture gate;
  - the choose.ts change: the background-refusal scenario arms through the one send path (e2e journal-failed had regressed, 3 of 3);
  - 958971be: removePile withdraws the held conversion's folder and note (write-once.ts:451, drive-vault.ts:1764), after the merge with c4-create-resume's `Intended.convert`.
- **Contract:** the c4-undo-compensate packet (last section) and TL-P4-27 addenda 9 to 11; the c4-create-resume packet and TL-P4-24 addendum 18.

## Look hardest at

- **The two "expected:" comments.** Is each error really reported or classified elsewhere, or is one now swallowed?
- **choose.ts.** Is this a product change, or only a fake-scenario hook? Does it reintroduce a second send path?
- **The withdraw.** It covers every reserved id the conversion holds, inside write-once.ts, with no second holder. c4-create-resume's tests stay green.
- **Housekeeping:** no test changed in this delta; notes lines are present.

Already run by the coordinator, at 958971be: pnpm check is green; e2e on both sources is green (186 and 145 passed), including journal-failed 3/3.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
