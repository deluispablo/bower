# Packet: c4-retry-fence fix round (P4-55 BLOCK plus the Codex pass, which agree)

- **Entry:** `c4-retry-fence`, escalated. It runs on a fresh Opus session. Worktree `/private/tmp/bower-c4-retry`, branch `c4-retry-fence` (at 22cff4b0). Merge `claude/p3` first.
- **Ruling sweep:** the round-1 packet's contract point 4 ("every fenced caller passes its fence"), TL-P4-24 addendum 2, the P4-55 card, and `docs/harness/2026-10-09-codex-c4-retry-fence-review.md`. Both reviews find the same gap, and the contract already decides the fix, so there is no new ruling.

## Contract

1. **`vault/journal.ts:509`.** Undo's Bin already runs `checkStillAsSeen` at :508. Pass that same check as the `fence` on its `trash` call, through `WriteOptions`, so a 429, a 403 rate limit or a 401 refresh runs the fence and then resends.
   - Without the fence, a burst fails the Undo, and a restore whose journal PATCH gets a 429 is left half-done: the item is unbinned, but its record stays.
   - Add no second check and no second retry path.
2. **The notes.** The row for `spine/barrier.ts:193` is wrong. `save.batch()` returns the runner's `FencedDrive`, so that write is fenced through `RunnerDrive.fenced`. Correct the row.
3. **Look for others.** Is any other caller that can hit a retryable refusal still unfenced? List it in the notes, and fence it the same way if it is an existing-file write.

## Red

- `journal Undo after a 429 and an outside move sends no resend` (the fence refuses).
- `journal Undo after a 429 with the file unchanged lands on the resend`.
- `a restore whose journal PATCH gets a 429 still finishes`.

## Verify

- The reds, plus every round-1 verify.
- `pnpm check`, through `bash harness/with-lock.sh`.
- The goldens: C04 78 and 25-runs 88.

## Commits

1. The red.
2. The fix.
3. A notes addendum ("Fix round (P4-55)") with compatibility rows and `tests changed:` lines.

Then a Claude delta re-review and a Codex pass on the delta.

**Note:** c4-undo-withdraw also edits `journal.ts` (`removeNow`). Whichever merges second resolves the conflict on its branch.
