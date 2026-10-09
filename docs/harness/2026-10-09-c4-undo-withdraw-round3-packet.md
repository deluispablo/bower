# Packet: c4-undo-withdraw round 3 (TL-P4-24 addendum 12, main f00b2c6b; mechanism re-planned)

- **Entry:** `c4-undo-withdraw`, escalated, `ui: true`. It runs on a fresh Opus session. Worktree `/private/tmp/bower-c4-undo`, branch `c4-undo-withdraw` (at 6f7c7310). Merge `claude/p3` first.
- **Ruling sweep:**
  - TL-P4-24 addenda 1, 3, 5, 11 and 12;
  - the "Round 2 pass" in `docs/harness/2026-10-09-codex-c4-undo-withdraw-review.md` (3 Important);
  - the P4-56b minors;
  - the round-1 and round-2 packets, whose rule still holds: a withdraw decides only on the holder's state, read while it holds that holder's exclusion.
- **If round 3 still finds holes, the lead re-plans the entry.**

## Contract (addendum 12)

1. **Delete `bower:sent-lines`.** It was a second keeper, and it caused all three defects: eviction, a swallowed write failure, and one key shared across folder locks. Remove its `PERSON_LOCAL` entry and the device fixture test. Update the compatibility row.
2. **The outbox line has three states:** waiting, then `confirmed { fileId }`, then dropped.
   - A confirmed line stays under its folder's key and lock.
   - It is never sent again.
   - It drops only when the listing shows its file (`filesOf`).
3. **If marking a line confirmed fails** (for example, storage is full), the line stays waiting with its reserved id. The withdraw then reads by id. Nothing is swallowed: the failure is logged with `console.error`.
4. **Undo takes the outbox lock, then reads:**
   - waiting: withdraw by its reserved id (round-2 rule);
   - confirmed: bin by `fileId`, through the fence;
   - gone: take the listing path;
   - unknown: refuse with the existing sentence.
5. **Lines saved before this change.** `isWaiting` reads them leniently, so a waiting line without a state reads as waiting. Add a fixture test.
6. **`withdraw`'s own trash passes its fence**, the same `checkStillAsSeen` (c4-retry-fence's contract point 4), so a 429 or 401 resends after the fence.
7. **No second keeper and no new storage key.** The one outbox is the home.

## Red

Rewrite Codex's 3 reds against the line states:
- `a confirmed line is never evicted before the listing shows its file`: 21 confirms in tab B, then an Undo in tab A bins the right file.
- `a failed confirm keeps the line waiting with its id and Undo withdraws by id`: the storage write throws.
- `confirmed lines of two folders never overwrite each other`: two folders, two locks.

Also:
- `an old outbox line without a state reads as waiting` (fixture);
- `withdraw's trash resends after a 429 through its fence`.

## Verify

- The reds.
- Every round-1 and round-2 verify, including the e2e (dock replace in place, removePile) on fake, phone and desktop, with axe.
- retry-fence's journal tests.
- `pnpm check` through `bash harness/with-lock.sh`.

## Commits

1. The red.
2. The fix.
3. A notes addendum ("Round 3 (addendum 12)") with compatibility rows and `tests changed:` lines.

Then a Claude delta re-review, a Codex pass on the delta, and the designer's check.
