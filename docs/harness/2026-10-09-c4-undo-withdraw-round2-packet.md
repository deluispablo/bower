# Packet: c4-undo-withdraw round 2 (TL-P4-24 addendum 11, main d7c0c692)

- **Entry:** `c4-undo-withdraw`, escalated, `ui: true`. It runs on a fresh Opus session. Worktree `/private/tmp/bower-c4-undo`, branch `c4-undo-withdraw` (at 1ed9097f). Merge `claude/p3` first.
- **Ruling sweep:**
  - TL-P4-24 addenda 1, 3, 5 and 11;
  - `docs/harness/2026-10-09-codex-c4-undo-withdraw-review.md` (2 Important);
  - the P4-56 card's minors;
  - the round-1 packet.
- **The rule (addendum 11):** a withdraw decides only on the holder's state, read while it holds that holder's exclusion.

## Contract

1. **Undo takes the outbox lock first, then reads the line** (Codex 1, `journal.ts:506`). The line is not read before the lock.
   - If an id was reserved since the press, withdraw that id.
   - If the line is already gone because its create was confirmed, bin the file by id from the record.
   - If that is unknown, refuse with the existing sentence.
2. **Send and withdraw are mutually exclusive per holder** (Codex 2, `drive-vault.ts:1706`, Sending). A withdraw waits for an in-flight create to settle, bounded by that create's own transport timeout, then acts:
   - landed: bin;
   - refused or unsent: let go;
   - unknown: refuse with the existing sentence.
   - No new copy. This applies to every keeper (journal line, Sending, Intended, upload record).
3. **Contract minors from P4-56:**
   - a byId 403/auth during withdraw is classified the way the refusal contract says (unknown or unreached), never rethrown as a raw error that shows the generic sentence;
   - the upload-record keeper is tested through `withdrawPile` with the sha check, not only at port level.
4. **The other P4-56 minors** go in the notes, with a line each saying what was done or why not:
   - a toast action that never settles;
   - `pnpm check` listed under Verify;
   - the stray blank line.
5. **The journal.ts overlap.** c4-retry-fence (journal.ts:509 fence) may merge first. If it does, merge claude/p3 and resolve the conflict in this worktree, keeping both, with the withdraw branch's `continue` before the `check()`/fence setup. Then rerun the verify and `pnpm check` under the lock. Never resolve it by hand in integrate.

## Red

- `an undo whose line got its id in another tab after the press withdraws that id` (Codex 1; two Journals in two tabs sharing `navigator.locks`; the bare line gets its id between the press and the lock).
- `a pile removed while its link create is in flight never leaves a live file` (Codex 2; delay the create, remove the pile, then the create lands with its answer lost).
- Cells for the byId 403 and the upload-record keeper through `withdrawPile`.

## Verify

- The reds, plus every round-1 verify, including the e2e `a dock undo that cannot reach Drive is replaced in place with try again` and the removePile e2e, on fake, phone and desktop, with axe.
- `pnpm check` through `bash harness/with-lock.sh`.

## Commits

1. The red.
2. The fix.
3. The notes addendum ("Round 2 (addendum 11)"), with compatibility rows and `tests changed:` lines.

Then a Claude delta re-review, a Codex pass on the delta, and the designer's check.
