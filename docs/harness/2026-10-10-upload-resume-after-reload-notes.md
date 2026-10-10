# upload-resume-after-reload: red delivery

implementer: codex

Role: separate red-owning Codex session (TL-P4-29); no implementation, commits, network or git writes.
Worktree: `/private/tmp/bower-upload-resume-after-reload`.
Baseline HEAD: `e910ddce7269718976aadbd67afd9f22643e5788`.
Owned changes: new `src/data/upload-resume.test.ts` and this notes file only; logs under `tmp-logs/`.
removed: none
tests changed: none; every pre-existing assertion is untouched.

## Reds

All five exact test names below fail at baseline HEAD on their intended assertions. No import/load errors,
timeouts, unhandled rejections or timer-gate errors occurred in the final run. Each positive control runs
before its red assertion and passed; the two fast-check failures wrap the underlying assertion failures.

1. `upload-resume-after-reload: upload save retains every member before reporting saved`
   - Real `DriveVault.addPile`, two distinct 10-byte Blobs, real queue, fake IndexedDB and
     `FakeDrive({ chunkMultiple: 4 })`. The first transfer is held at offset 4 after `addPile` resolves.
   - Failure: the committed device record keys contain only the first of the two declared members.
     The first member's original bytes and confirmed offset 4 are checked before this assertion.
     The eventual green must also match both bodies against the originals.
   - Positive control: an unblocked two-member `addPile` sends both original bodies exactly once by
     member identity and removes their pending records only after completion.

2. `upload-resume-after-reload: upload reload resumes all saved members without a picker or duplicate`
   - Same accepted two-member pile, first chunk held at offset 4. Stop the queue and dispose the vault,
     release the aborted transfer, then construct a fresh store/queue/vault over the same IDB and Drive.
     Resume through `piles()`, synchronize public queue startup, await idle and refresh the full read.
   - Failure: the second member has `chooseAgain: true` after reload. The first member arrives with its
     original bytes and reserved ID; the first resumed operation is a status query, followed by offset 4,
     and that member opens no second session. Those assertions pass before the red.
   - Positive controls: the unblocked two-member app save and a one-member interrupted app reload both
     complete exactly once without reselection; the latter runs the same reload helper.

3. `upload-resume-after-reload: upload first full read waits for retained queue hydration`
   - Save a valid loose declaration and its bytes, hold offset 4 and dispose the first page. Gate the
     fresh real store's first list result during `DriveVault.piles()`. An independent IDB transaction
     supplies an event-loop checkpoint before releasing hydration; no elapsed-time wait is used.
     A corrected implementation can await the gate and still finish normally after it opens.
   - Failure: the first completed full read returns `chooseAgain: true` for the retained loose member.
   - Positive control: explicitly hydrate the real queue over those same retained bytes first, hold
     sending, then call the same public `piles()` entry point. It returns one queued member with a
     nonnegative upload value and no reselection; the device still has the record and bytes afterward.

4. `upload-resume-after-reload: accepted durable members survive generated transfer reloads`
   - Fast-check generates 2–5 members, transfer barriers at offset 4 or 8 and stale saved offsets.
     Seed 531, 12 runs, explicit example `[3, 8, true]`; shrinking reports `[2, 4, false]`, path `0:0:0:0`.
   - Invariants through the same real app reload helper: server offset governs sending; preserve the
     first reserved identity; no reselect; one file per declared member with original bytes; device
     pending state disappears only after confirmed arrival.
   - Failure: later accepted members require reselection after reload, as in red 2. The initial example
     also reaches the stale-offset and offset-8 assertions before failing for its missing later members.
   - Positive controls: an unblocked three-member app save, and a one-member interrupted reload at 8
     with saved confirmed offset deliberately reset to 0. Drive's offset 8 wins and it arrives once.

5. `upload-resume-after-reload: save waits for committed bytes across generated staging barriers`
   - Fast-check generates 2–5 members; hold actual `UploadStore.add` before its device commit. Record
     whether public `addPile` resolved before the barrier opens, using an independent IDB transaction
     as the checkpoint. Open the barrier and settle the save before asserting that recorded outcome.
     Seed 532, 12 runs; shrinking reports `[2]`, path `0:0`.
   - Failure: `savedBeforeCommit` is true although no pending record or bytes were committed then.
   - Positive control: direct public real `queue.add` waits behind the same device barrier. It does
     not resolve until the transaction commits, after which a fresh store reads its exact original bytes.

All scheduling uses promise barriers and committed fake IndexedDB transactions. FakeDrive and the real
queue receive injected clocks; Date.now is fixed for the app boundary. No real timers, polling,
`vi.waitFor`, `.only` or `.skip` were added. Public runtime exports are obtained through `exported`,
which turns a missing API into a failed `expect`. No new production export is required.

## Verification

Final commands (all output redirected; only failure excerpts inspected):

```sh
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/upload-resume-reds.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/upload-resume-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/upload-resume-tsc-node.log 2>&1
pnpm exec eslint src/data/upload-resume.test.ts > tmp-logs/upload-resume-eslint.log 2>&1
```

- New test file: exit 1, five intended assertion failures (including two fast-check assertion causes).
- App tsc: exit 0. Node tsc: exit 0. Touched-file eslint: exit 0.
- Initial fixture selection used the wrong app-property key in the positive control. Corrected the new
  test to use the existing `PROP.item` home, then reran. Initial non-null assertions were also removed.
  The final log contains only the intended failures described above.
- No full check or e2e was run: this session was explicitly limited to the new red file and static checks.
  No existing suite was run, including for the contradiction audit, because the user allowed only the new file.

## Existing assertions and TL-P4-51

The Q2/Q5/Q6 E1 behaviours did not require editing any existing assertion. The packet's broader Q1
ruling has these conflicting existing assertions, all preserved, in
`failed remote logout retains bytes and metadata until the successful retry`:

- `src/data/live/live.test.ts:1695`: both assertions retain selected and orphan draft Blobs after a failed
  public sign-out. Q1 requires locally forgetting the person even when remote sign-out fails.
- `src/data/live/live.test.ts:1696`: every person-local metadata key remains populated after that failure.
- `src/data/live/live.test.ts:1697`: every person-session metadata key remains populated after that failure.

Q1 belongs to E2; these contradictions are reported for the lead, not weakened or implemented here.
The rejection assertion at line 1694 and preserved outbox/preferences at line 1698 do not conflict.

`src/data/vault/drive-vault.test.ts:1460` has an obsolete sign-out title/comment. Its retention assertions
at lines 1471 and 1484 exercise queue.stop plus vault.dispose, not public session.signOut. Preserve them:
ordinary disposal must still retain uploads. The sign-out wording needs the E2 lead's ruling, not a
change to stop's retention semantics.

`src/data/vault/drive-vault.test.ts:2535` intentionally completes a full read before a gated account
answer, with no retained member in its fixture; lines 2540–2541 verify the later storage notice and
subscription. This is not a contradictory reselection assertion. Preserve it when choosing how to
wait for hydration before a missing-member decision; a blanket await at the top of every piles read
would deadlock that existing fixture. No new numeric bound or save deadline was added.

## Standard solution and sources

No network was used. References below are cited from the packet/prep and the in-worktree mechanism;
they were not fetched or verified online in this session.

- [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
  retain the session URI, query with `Content-Range: bytes */N`, obey 308/server Range, and reopen expired
  sessions with the same logical file identity. Never log sensitive session URIs.
- [Drive pre-generated IDs](https://developers.google.com/workspace/drive/api/guides/manage-uploads#pre-generated-ids):
  retain the reservation before creating, and reconcile the existing reserved file after ambiguous replies.
- [IndexedDB transaction lifetime](https://w3c.github.io/IndexedDB/#transaction-lifetime): a write's
  request success is distinct from transaction completion. The existing store's `finished` listens for
  `oncomplete`; `add` commits bytes and record together before resolving. Browser eviction/refused storage
  still needs the packet's honest fallback; these tests do not assert protection from device failure.
- Reuse: `src/data/upload-store.ts`, `src/data/upload-queue.ts`, `src/data/drive/resumable-upload.ts`
  and write-once are their existing mechanism homes. No second queue, lock, protocol or store was added.

## Left out

Implementation and coordinator commits; E2 sign-out/discard interleavings and purge; E3 orphan count;
E4 UI/e2e/designer review. Existing expired-session, moved-arrival, hash-reselect, storage-limit and
account/folder-isolation assertions remain untouched. This red session does not claim full-suite green.
