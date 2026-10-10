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

## Implementation

Implementer: Codex, 2026-10-10. Baseline HEAD: `dd0b8dfbbc4fbc90fd589bb1ce731025275e7ea9`.
Status: **blocked under TL-P4-51** after completing the entire targeted data suite.
The production changes remain in this worktree for the lead to review. No network, git-writing
command, test edit, shared harness edit or commit was performed.

### Changes retained

- `DriveVault.addPile` now awaits the existing queue's `add` for every accepted Blob before
  reporting saved. The queue still owns committed IndexedDB staging and the explicit memory
  fallback; saving does not wait for Drive transfer. No queue API, store or protocol was added.
- The previous enqueue-and-watch helper is split into staging and completion observation.
  Completion observation reuses the staged queue identity. Target metadata has one helper;
  existing `freeName` includes staged siblings that the Drive listing cannot yet contain.
- Missing-member decisions wait for existing queue startup/hydration. Folder rows collect queued
  state after that decision; a retained loose member uses its queue row instead of a picker.
  An ordinary listing without a missing-member decision still finishes before a gated account
  answer, preserving `drive-vault.test.ts:2535`.
- Existing write-once reconciliation, resumable transport, destination refusal and live session
  fencing are unchanged. The retained candidate is incomplete and is not an accepted delivery.

removed: `src/data/vault/drive-vault.ts`: 12 old lines, replaced or moved; no mechanism deleted.
removed: early queued/sending snapshots and pre-hydration local-key snapshot moved after hydration.
removed: fire-and-forget-only save setup replaced by committed Blob staging before the tracked send.
removed: inline name/property construction extracted to the shared target helper.
removed: enqueue-and-watch header and local added-ID lookup replaced by staged-ID observation.
tests changed: none.

### Research and reuse

No network was used. The packet/prep and existing code provide the research, with these inherited
official references (not fetched or verified online in this session):

- [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
  retain the session URI; query status using `Content-Range: bytes */N`; respect 308/server Range;
  reconcile completion and reopen expired sessions using the same logical identity. Existing
  `resumable-upload.ts` and the queue implement this, including bounded restarts; neither was edited.
- [Drive pre-generated IDs](https://developers.google.com/workspace/drive/api/guides/manage-uploads#pre-generated-ids):
  the existing write-once keeper persists the reserved identity and reads it back after an ambiguous
  answer. The candidate reuses it through the queue, rather than creating another reservation path.
- [IndexedDB transaction lifetime](https://w3c.github.io/IndexedDB/#transaction-lifetime):
  request success does not mean transaction completion. Existing `upload-store.ts:213–219` writes
  bytes and metadata together and awaits `finished`, whose success is `oncomplete`. Awaiting the
  existing queue `add` uses that boundary without changing durability limits or fallback wording.
- Original-app adaptations already live in `upload-queue.ts` and `upload-store.ts`; their provenance
  is recorded there. No original checkout, dependency download or new library was needed.

### Verification and complete contradiction audit

Every command below redirected all output under `tmp-logs/`; only failures and result counts were read.

```sh
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/upload-resume-implementation-reds.log 2>&1
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/upload-resume-implementation-green.log 2>&1
pnpm exec vitest run src/data --maxWorkers=2 > tmp-logs/upload-resume-data.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/upload-resume-implementation-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/upload-resume-implementation-tsc-node.log 2>&1
pnpm exec eslint src/data/vault/drive-vault.ts > tmp-logs/upload-resume-implementation-eslint.log 2>&1
```

- Baseline reds: all five failed on assertions, reproducing the committed red delivery.
- Candidate reds: three passed, two failed; this is not a green delivery despite the log's filename.
- Entire data suite: **78 files, 4,145 tests; 76 files and 4,141 tests passed; four tests failed**.
  No other data-suite failure was reported. Duration: 61.55 seconds. Both sign-out retention and
  the gated-account notice test remain untouched and passed.
- App tsc, node tsc and touched-production-file eslint: exit 0, empty logs.
- `pnpm check` and demo/fake app/capabilities e2e were not run: the mandatory contradiction stop
  applies after the complete targeted suite. No green mark or UI/designer verification is claimed.

All **five** contradicting tests are listed below, including the positional red that passed in the
full run but failed in the candidate-only run. Random member identities remain random; production
identity generation and ordering were not changed merely to satisfy the fixtures.

1. `upload-resume-after-reload: upload save retains every member before reporting saved`
   — `src/data/upload-resume.test.ts:194`; assertions at `:204–205`.
   The fixture equates `records[0]` with `pile.items[0]`. All records have the same injected
   `addedAt`; IndexedDB enumerates the compound key, including random member keys, then the store
   stably sorts only by `addedAt` (`upload-store.ts:210`). Once Q2 retains both members, a sibling
   can be first with confirmed 0 and its own original bytes. Candidate-only failure: 0 versus 4.
   The contract requires identity-based retention of all members, not selecting the first record
   by position. Both bodies are already checked by member identity later in this same test.

2. `upload-resume-after-reload: upload reload resumes all saved members without a picker or duplicate`
   — `src/data/upload-resume.test.ts:219`; helper assumptions at `:234–235` and `:254–255`.
   `reloadCase` selects the first store record instead of the held member's identity. Full-suite
   failure: confirmed 0, null session and null reservation versus the held member's offset 4.
   Its later global-first status/put assertions also assume that member resumes before every newly
   staged sibling. Q2 requires all bytes retained and the resumed session's own server offset;
   it does not require tie ordering among equal timestamps or put calls from different members.

3. `upload-resume-after-reload: accepted durable members survive generated transfer reloads`
   — `src/data/upload-resume.test.ts:333`; same helper at `:234–235`, invoked at `:338`.
   The generated test has the identical positional contradiction for 2–5 retained members.
   Candidate-only counterexample: `[3,4,true]`, seed 531, path `0:1`.
   Full-suite counterexample: `[2,8,true]`, seed 531, path `0:0`; selected sibling has confirmed 0
   and no session/reservation, while the barrier held the first submitted member at offset 8.
   No bound, seed, example, assertion or test was changed.

4. `a file that lands after its pile is gone goes to the Bin`
   — `src/data/vault/drive-vault.test.ts:950`; fixture dependency at `:940–944`.
   The helper awaits `addPile` before releasing the `store.add` commit gate at `:944`. Under Q2,
   `addPile` must await that transaction. The fixture therefore deadlocks and reaches its unchanged
   5,000 ms timeout. Retaining the old fixture ordering would require reporting saved before the
   device transaction, directly contradicting the packet's save boundary.

5. `a file that lands during a halt is not uploaded again on Undo`
   — `src/data/vault/drive-vault.test.ts:960`; same helper dependency at `:940–944`.
   The same pre-commit-save ordering causes the same unchanged 5,000 ms timeout. Its late-arrival
   and Undo safety assertions remain valid; its scheduling must be reconciled with Q2 by the lead.

The Q1 sign-out retention contradictions previously recorded above are explicitly assigned to
`upload-sign-out-forget`; no Q1 implementation or assertion was touched. The staging-barrier and
hydration reds (`:342` and `:270`) passed in both candidate runs. Lead resolution of the five E1
fixture contradictions is required before another implementation round and remaining gates.

## Red repair 1

Red-owning Codex session, 2026-10-10; TL-P4-53 Q2, sweep under TL-P4-51,
lead authorization supplied in the assignment. Test fixtures and this notes section only.
No network or git-writing command. The implementer's uncommitted production file is
unchanged (SHA-256 verified against `tmp-logs/red-repair-1-production.sha256`).
All expected members, bytes, offsets, sessions, reservations, Bin and Undo assertions,
fast-check bounds, seeds, examples and timeouts are retained.

### Changed tests (current line numbers)

tests changed: src/data/upload-resume.test.ts:194: TL-P4-53 Q2: select the held first member by memberKey for its confirmed offset and original bytes.
tests changed: src/data/upload-resume.test.ts:220: TL-P4-53 Q2: reloadCase selects that member by identity and checks its own session/reserved-ID calls, without sibling ordering assumptions.
tests changed: src/data/upload-resume.test.ts:335: TL-P4-53 Q2: generated reloads use the same identity-based helper; all generated values and invariants stay.
tests changed: src/data/upload-resume.test.ts:344: TL-P4-53 Q2: committedControl selects MEMBER_ID for its exact retained bytes; the single-record count assertion stays.
tests changed: src/data/vault/drive-vault.test.ts:951: TL-P4-53 Q2: shared helper releases store.add's commit gate before awaiting addPile; every Bin assertion stays.
tests changed: src/data/vault/drive-vault.test.ts:961: TL-P4-53 Q2: same helper gate repair; every Undo and one-file assertion stays.
tests changed: src/data/upload-queue.test.ts:179: TL-P4-53 Q2: select member-1 for the retained Blob after bounded expiry; keep count and failure assertions.
tests changed: src/data/upload-queue.test.ts:284: TL-P4-53 Q2: select member-1 for progress, reservation and retained/deleted bytes; keep single-record assertion.
tests changed: src/data/upload-queue.test.ts:542: TL-P4-53 Q2: select the discarded member by its queue memberKey for the deleted-body assertion.
tests changed: src/data/upload-queue.test.ts:595: TL-P4-53 Q2: select member-1 for retained bytes after read-back failure; keep single-record and retry assertions.
tests changed: src/data/upload-queue-real.test.ts:327: TL-P4-53 Q2: select the submitted member by memberKey for its reserved identity after a lost reply.
tests changed: src/data/upload-store.test.ts:27: TL-P4-53 Q2: select the later member by memberKey for saved session/offset/reservation; preserve the explicit oldest-first ordering assertion.

### Sweep and research

Searched all src test files for upload-store list calls, positional record selections,
store.add overrides, staging gates and awaited addPile calls. The extra conversions
above include single-record fixtures. Other positional records found are journal,
worker or contract records, not upload records. No other gated store.add/addPile fixture
was found; generated staging barriers already release commit before awaiting saving.
Search evidence: `tmp-logs/red-repair-1-selector-sweep.log` and
`tmp-logs/red-repair-1-gate-sweep.log`.

Research is inherited from Implementation's official Drive and IndexedDB references,
without network access. IndexedDB transaction completion remains the staging boundary;
member identity is independent of enumeration order. No library or mechanism was added.

### Verification and remaining contradictions

Baseline before repair: 234 tests, 231 passed and three failed:
generated reload selected confirmed 0 instead of 8 (seed 531, path `0:0:1`,
example `[2,8,false]`); both Bin/Undo tests timed out at unchanged 5,000 ms.
Log: `tmp-logs/red-repair-1-before.log`.

The first full repaired run: five files, 292 tests, 290 passed and two failed.
All five upload-resume tests and all queue/store tests passed. Both Bin/Undo tests
still timed out. Log: `tmp-logs/red-repair-1-tests.log`.

Merely opening the commit gate before awaiting saved removes the staging deadlock,
but the shared Bin fixture still cannot finish its late-arrival scheduling: its folder
Bin awaits `binned`, which is released only by trashing the late file. Q2 changes when
the completion observer is installed relative to the held staging and the Bin action.
Starting Bin during staging was also checked, retaining every assertion; both tests
still timed out (`tmp-logs/red-repair-1-bin-focus.log`). That exploratory scheduling
is not retained. The final diff keeps only the specifically authorized gate reorder.
No transfer gate, queue mock, bypass or altered Bin expectation was introduced.

Remaining contradictions, complete touched-suite audit:
- `src/data/vault/drive-vault.test.ts:951`: a file that lands after its pile is gone goes to the Bin — 5,000 ms timeout.
- `src/data/vault/drive-vault.test.ts:961`: a file that lands during a halt is not uploaded again on Undo — 5,000 ms timeout.

Status: blocked under WORKER.md TL-P4-51 pending lead ruling on those two fixture races.
Full check/e2e remain outside this repair and are not claimed.

Final verification (final diff, all output under tmp-logs/):

```sh
pnpm exec vitest run src/data/upload-resume.test.ts src/data/vault/drive-vault.test.ts src/data/upload-queue.test.ts src/data/upload-queue-real.test.ts src/data/upload-store.test.ts --maxWorkers=2 > tmp-logs/red-repair-1-final-tests.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/red-repair-1-final-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/red-repair-1-final-tsc-node.log 2>&1
pnpm exec eslint src/data/upload-resume.test.ts src/data/vault/drive-vault.test.ts src/data/upload-queue.test.ts src/data/upload-queue-real.test.ts src/data/upload-store.test.ts > tmp-logs/red-repair-1-final-eslint.log 2>&1
```

Final touched suite: **290 passed, two failed, 292 total across five files**; the only
failures are the two unchanged Bin/Undo timeouts listed above. Duration 21.55 seconds.
Both tsc projects and eslint on all five touched test files exited 0 with empty logs.
`git diff --check` passed. Production hash matches. No commits were made.
removed: none; positional selectors and the store-gate await order were replaced only.
