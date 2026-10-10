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

Implementer: Codex, 2026-10-10. Continuation HEAD: `729fa07e23e3eac90dcd1c15fea454feeaf94cd6`.
Status: **blocked under TL-P4-51** after the entire targeted data suite completed.
The previous UNCOMMITTED production change was retained. Red repair 1 is already committed.
No network, git-writing command, test edit, shared harness edit or implementation commit was performed.

### Changes retained

- `DriveVault.addPile` awaits the existing queue's `add` for every accepted Blob before
  reporting saved. The queue owns committed IndexedDB staging and the explicit memory fallback;
  saving does not wait for Drive transfer. No queue API, store or protocol was added.
- Staging and completion observation reuse the same queue identity. Target metadata has one
  helper; existing `freeName` includes staged siblings the Drive listing cannot yet contain.
- Missing-member decisions wait for existing queue startup/hydration. Folder rows collect queued
  state afterward; a retained loose member uses its queue row instead of a picker. An ordinary
  listing without a missing-member decision still finishes before a gated account answer.
- Existing write-once reconciliation, resumable transport, destination refusal, halt/withdrawal
  and live session fencing remain unchanged. The candidate is not an accepted delivery.
- Temporary production diagnostics were removed after tracing both remaining timeouts.
  `cmp` confirmed the production file exactly matches the retained change from this turn's start.

removed: `src/data/vault/drive-vault.ts`: 12 old lines replaced or moved; no mechanism deleted.
removed: early queued/sending and pre-hydration local-key snapshots moved after hydration.
removed: fire-and-forget-only save setup replaced by committed Blob staging before the tracked send.
removed: inline name/property construction extracted to the shared target helper.
removed: enqueue-and-watch header and local added-ID lookup replaced by staged-ID observation.
removed: temporary TRACE diagnostics; none remain in the final production diff.
tests changed: none.

### Research and reuse

No network was used. Research is inherited from the packet/prep and existing code. Official references
below were not fetched or verified online in this session.

- [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
  retain the session URI; status query with `Content-Range: bytes */N`; obey 308/server Range;
  reconcile completion and reopen expired sessions with the same logical identity. Existing
  `resumable-upload.ts` and the queue remain the protocol's home.
- [Drive pre-generated IDs](https://developers.google.com/workspace/drive/api/guides/manage-uploads#pre-generated-ids):
  the existing write-once keeper persists the reservation and reads it back after an ambiguous reply.
- [IndexedDB transaction lifetime](https://w3c.github.io/IndexedDB/#transaction-lifetime):
  request success is distinct from transaction completion. Existing `upload-store.ts` writes bytes
  and metadata together and awaits transaction `oncomplete`; awaiting queue `add` uses that boundary.
- Original-app adaptations already live in `upload-queue.ts` and `upload-store.ts`, with provenance
  recorded there. No new library, store, queue, protocol, lock or session fence was introduced.

### Verification and complete contradiction audit

All output is under `tmp-logs/`; only failures and aggregate result counts were inspected.

```sh
pnpm exec vitest run src/data/upload-resume.test.ts src/data/vault/drive-vault.test.ts --maxWorkers=2 > tmp-logs/resume-continue-targeted.log 2>&1
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/resume-continue-reds.log 2>&1
pnpm exec vitest run src/data --maxWorkers=2 > tmp-logs/resume-continue-data.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/resume-continue-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/resume-continue-tsc-node.log 2>&1
pnpm exec eslint src/data/vault/drive-vault.ts > tmp-logs/resume-continue-eslint.log 2>&1
```

- The exact five upload-resume reds pass, both standalone and in the combined targeted run.
- Combined targeted suite: 232 passed, two failed, 234 total across two files.
- App tsc, node tsc and touched-production-file eslint: exit 0, empty logs. `git diff --check` passes.
- Entire data suite: **78 files, 4,145 tests; 77 files and 4,143 tests passed; two tests failed**.
  Duration: 68.28 seconds. The only failures are both fixture contradictions listed below; no
  unhandled errors or other data-suite failures were reported. All five reload reds passed here too.
  Sign-out retention and the existing gated-account notice test passed unchanged.

The complete remaining E1 contradiction list is:

1. `a file that lands after its pile is gone goes to the Bin`
   — `src/data/vault/drive-vault.test.ts:951`; shared fixture at `:905–948`, gate at `:931`.
2. `a file that lands during a halt is not uploaded again on Undo`
   — `src/data/vault/drive-vault.test.ts:961`; the same fixture and gate.

Both time out at the unchanged 5,000 ms limit. Red repair 1 correctly opens the store gate before
awaiting `addPile` (`:941–943`), so the old committed-byte/save deadlock is resolved. It does not
establish the late arrival the helper requires. The fixture awaits saving and starts public trash,
then refuses to Bin the folder until an individual late file is Binned (`:931`, `:937`). It never
waits for its `holdChunks` arrival callback before trash (`:928`, `:944–946`).

Deterministic trace of each failing test: the saved member already has its queue ID; trash finds
it uploading; the existing `queue.halt` aborts and settles it as waiting with reserved ID `r3`;
write-once withdrawal reads that reserved ID and returns null (no file arrived). There is no
`putChunk` completion callback and no queue done event. The folder's fixture gate therefore waits
forever for the Bin of a file the existing halt correctly prevented from arriving. The completion
observer was installed before trash in both traces: moving its installation cannot supply an arrival.
Logs: `tmp-logs/resume-race-diagnosis.log` and `tmp-logs/resume-race-confirm.log`.

This fixture originally relied on a store add still being unresolved when public saving completed:
Bin could miss that member, and the member could subsequently start. Q2 requires that member to be
staged and queued before saving completes; the existing halt/withdrawal now sees it and stops it.
Making this particular schedule produce a late file would require bypassing or delaying that halt,
or awaiting transfer before reporting saved. Neither follows the packet's staging boundary and
reuse of the existing queue/withdrawal. The late-arrival and Undo safety assertions are valid; the
fixture needs a controlled already-arrived/late-answer schedule, ruled by the lead. No assertion,
timeout, gate, queue or transport was changed to manufacture green.

Q1 sign-out retention tests belong to `upload-sign-out-forget` and remain untouched. Their earlier
policy contradictions are outside this E1 audit. The positional selections fixed by red repair 1
are no longer contradictions. No other contradiction is inferred from passing tests.

`pnpm check` and demo/fake app/capabilities e2e are not run after the TL-P4-51 contradiction stop;
no green mark, UI/designer verification or accepted completion is claimed. The production change
is kept uncommitted for the lead, with this full audit in its Implementation section.

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

## Red repair 2

Red-owning Codex session, 2026-10-10; TL-P4-29, TL-P4-53 addendum 3.
Only the shared late-arrival fixture's schedule and this section were changed.
No network or git-writing command. The implementer's uncommitted production change
is unchanged: SHA-256 matches `tmp-logs/red-repair-2-production.sha256`.

tests changed: src/data/vault/drive-vault.test.ts:914: TL-P4-53 addendum 3: stage before saved, land the reserved file with an error instead of its final answer, hold the existing checksum read-back until the real halt starts; preserve both Bin/Undo tests and every assertion, timeout and existing gate.

The fixture lets the real final chunk create the file, then returns a conflict error
instead of its successful final answer. The existing resumable conflict recovery
reads the reserved file and its checksum. A deterministic barrier holds that read's
answer after the real read has completed; trash starts only after this boundary.
The halt spy calls the original halt first, retaining its abort and settlement,
then releases the already-sent read's answer. It never bypasses or delays halt.
The queue's real completion observer consequently receives the late file while
trash is in progress, tries its first Bin, retries the injected failed Bin, and
releases the unchanged folder-Bin barrier. Undo restores the same file once.
The staging gate, failed-first-Bin injection and folder-Bin gate are unchanged.
No real timers were added; no queue, store, transport or production mechanism changed.

Both preserved tests now pass at their new lines:
- `src/data/vault/drive-vault.test.ts:981`: a file that lands after its pile is gone goes to the Bin.
- `src/data/vault/drive-vault.test.ts:991`: a file that lands during a halt is not uploaded again on Undo.

Research is inherited from Implementation's official Drive and IndexedDB references,
without network access. Existing conflict read-back in `drive/resumable-upload.ts`
and the real queue halt/completion remain the mechanisms exercised by the fixture.

Verification, all output in `tmp-logs/`:

```sh
pnpm exec vitest run src/data/vault/drive-vault.test.ts --maxWorkers=2 > tmp-logs/red-repair-2-before.log 2>&1
pnpm exec vitest run src/data/vault/drive-vault.test.ts --maxWorkers=2 > tmp-logs/red-repair-2-tests.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/red-repair-2-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/red-repair-2-tsc-node.log 2>&1
pnpm exec eslint src/data/vault/drive-vault.test.ts > tmp-logs/red-repair-2-eslint.log 2>&1
```

Baseline: 227 passed, two failed, 229 total; only the two named tests timed out
at the unchanged 5,000 ms limit. Final: **229 passed, 229 total**, one file,
7.67 seconds. Both tsc projects and touched-test eslint exited 0 with empty logs.
`git diff --check` passes. Production hash matches. No commits were made.
Full `pnpm check`, data sweep and e2e belong to implementation/integration delivery
and were not run in this explicitly scoped red repair. No UI change or green mark
is claimed. There are no remaining contradictions in the whole touched file.
removed: none; only the shared fixture's schedule was replaced.
