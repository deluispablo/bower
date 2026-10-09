# Packet: P4-56 review (c4-undo-withdraw, escalated data safety, ui: true)

This review is read-only and fresh. Run unit tests only. Never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c4-undo`.

## What to review

- **Diff:** `git diff baaa781b38f9dc2e16dc69a7a38133e4acb60b05..c4-undo-withdraw`. Red 2ec192f4, fix 8d9c59ca, notes 1ed9097f.
- **Packet:** `docs/harness/2026-10-09-c4-undo-withdraw-packet.md` (contract per TL-P4-24 addenda 1, 3 and 5). Its "What the person sees" table is signed off by the designer. The defect is `undo-drops-reserved-create`, Codex finding 3 in `docs/harness/2026-10-09-codex-p3-review.md`.
- **Context:** c4-app-fence is merged; the Bin goes through `checkStillAsSeen`, and the one landed definition lives in `spine/write-once.ts`. c4-retry-fence is in a fix round and will forward the fence at `journal.ts:509`. Whichever entry merges second resolves the overlap in its own worktree.
- **Fixed questions (TL-P4-20):** check the contract first, then look for a second way: a second withdraw path, a second refusal message, or a second toast component. Give every finding a severity.

## Look hardest at

- **`withdraw` is the one exit on the Holder port.** Its outcomes:
  - unsent: let go, without a read;
  - 404: let go;
  - in the Bin: let go;
  - live: goes to the Bin through the helper, never a hard delete;
  - unknown: keeps the line and refuses.
- **Callers.** `journal.remove` (removeNow) calls `withdraw` under `acrossTabs` before the line drops. Drive-vault `Sending`/`reservedFile`, `Intended` and the upload record use the same withdraw.
- **Scope.** The dock Undos are Bin, rule and restore, plus `removePile`. Lines 332, 352 and 436 are untouched.
- **The refusal** has its own BowerError code, so `report()` can tell it from journal's storage-failure sentence.
- **Dock.** `toast.tsx` `replace(id, text, action)`:
  - keeps the item;
  - restarts the 8 s timer, which pauses on hover or focus;
  - keeps focus on "Try again", which runs the same Undo;
  - the exact sentence, never in `--danger`.
- **removePile** (addendum 5): inline in PileScreen's confirm box, `role=alert`, muted. The line is replaced and focus goes to "Remove the pile", with no toast. The generic failure sentence stays.
- **The fake trigger** `withdraw-unreached` and `__unreachDrive()`: the touches to `choose.ts`, `demo/scenario.ts` and `worker-http.ts` must be test-only, with no path in production.
- **The class test** `a withdrawn intended create never leaves a live file`: does it cover every keeper, every create outcome, every withdrawal, the two-tab cell and the unknown cell? Which cells were red?
- **Housekeeping:** the `tests changed:` lines, compatibility rows, no `.only` or `.skip`, and no real timers.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line must be under 120 characters.
