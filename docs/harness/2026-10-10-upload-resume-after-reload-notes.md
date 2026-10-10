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

Implementer: Codex, 2026-10-10. Continuation HEAD: `9c059527` (red repair 2).
The retained UNCOMMITTED production change passes every requested test and static check.
No further production edit was necessary after the committed fixture repairs. Implementation
verification is green; full delivery gates remain incomplete for the reasons below.
No test, sign-out policy, shared harness record or dependency was changed in this continuation.
The production change and these notes remain uncommitted for the coordinator.

### Changes retained

- `DriveVault.addPile` awaits the existing queue's `add` for every accepted Blob before
  reporting saved. Queue `add` owns committed IndexedDB staging and the explicit memory fallback;
  saving does not wait for Drive transfer. No queue API, store or protocol was added.
- Staging and completion observation reuse the same queue identity. The shared target helper
  uses existing `freeName`, including staged siblings not yet present in the Drive listing.
- A missing-member decision waits for existing queue startup/hydration. Folder rows collect
  queued state afterward; a retained loose member uses its queue row rather than a picker.
  An ordinary listing without a missing-member decision still finishes before a gated account answer.
- Existing write-once read-back, resumable transport, destination refusal, halt/withdrawal,
  limits, storage fallback and live session fencing remain the mechanism homes.
- No temporary diagnostics remain. Final production diff: 53 added lines, 12 removed lines.

removed: `src/data/vault/drive-vault.ts`: 12 old lines replaced or moved; no mechanism deleted.
removed: early queued/sending and pre-hydration local-key snapshots moved after hydration.
removed: fire-and-forget-only save setup replaced by committed Blob staging before the tracked send.
removed: inline name/property construction extracted to the shared target helper.
removed: enqueue-and-watch header and local added-ID lookup replaced by staged-ID observation.
tests changed: none.

### Research and reuse

No network was used. Research is inherited from the packet/prep and existing code. Official references
below were not fetched or verified online in this session.

- [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable):
  retain the session URI; query status with `Content-Range: bytes */N`; obey 308/server Range;
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

All command output is under `tmp-logs/`; only failures and aggregate result counts were inspected.

```sh
pnpm exec vitest run src/data/upload-resume.test.ts src/data/vault/drive-vault.test.ts src/data/upload-queue.test.ts src/data/upload-queue-real.test.ts src/data/upload-store.test.ts --maxWorkers=2 > tmp-logs/resume-final-targeted.log 2>&1
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/resume-final-reds.log 2>&1
pnpm exec vitest run src/data --maxWorkers=2 > tmp-logs/resume-final-data.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/resume-final-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/resume-final-tsc-node.log 2>&1
pnpm exec eslint src/data/vault/drive-vault.ts > tmp-logs/resume-final-eslint.log 2>&1
```

- Exact five upload-resume reds: **5 passed**, standalone, 947 ms.
- Whole targeted suite: **292 passed across five files**, 7.44 seconds, exit 0.
- Entire data suite: **4,145 passed across 78 files**, 44.18 seconds, exit 0.
- App tsc, node tsc and touched-production-file eslint: exit 0, empty logs.
- Read-only `git diff --check`: exit 0.
- No failed tests, unhandled errors or remaining E1 contradictions. The full targeted suite was
  completed before this conclusion (TL-P4-51). Both Bin/Undo assertions pass under the committed
  red repair 2 schedule; no timeout, assertion, bound or test was changed by this implementation.
- Sign-out retention tests remain untouched and passed as part of the data suite. Policy work
  remains assigned to `upload-sign-out-forget`.

### Incomplete delivery gates

The packet's full gates were attempted separately from the requested checks:

```sh
GIT_OPTIONAL_LOCKS=0 bash harness/with-lock.sh pnpm check > tmp-logs/resume-final-check.log 2>&1
E2E_SOURCE=demo bash harness/with-lock.sh pnpm exec playwright test e2e/app.spec.ts e2e/capabilities.spec.ts > tmp-logs/resume-final-e2e-demo.log 2>&1
E2E_SOURCE=fake bash harness/with-lock.sh pnpm exec playwright test e2e/app.spec.ts e2e/capabilities.spec.ts > tmp-logs/resume-final-e2e-fake.log 2>&1
```

- `pnpm check` was interrupted with Ctrl-C, exit 130, after lint/typecheck and during its unit stage.
  Starting it was an oversight: `src/harness-git.test.ts` runs git-writing commands in scratch
  fixtures, conflicting with the user's prohibition. Cancellation happened after that stage started;
  the log has no completed `harness-git` result, so it cannot establish whether a fixture git write ran.
  No git-writing command was issued directly; no repository commit, branch or test edit was made.
  Do not treat this interrupted run as green or claim a new check mark.
- Both demo and fake e2e attempts exited 1 before tests: the sandbox denied the local dev server's
  listen on `::1:6512` with `EPERM`. No browser assertion ran; neither source is claimed green.
  Permissions cannot be escalated in this session. No workaround or environment edit was made.
- Coordinator full check/e2e, independent reviews and designer U3 verification remain before close.
  Implementation and all explicitly requested verification are complete, with the retained change
  ready for those gates. These environment/authorization limits are not test contradictions.

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

tests changed: src/data/upload-queue-real.test.ts: red repair 1 (TL-P4-53 Q2): select records by member identity, not store position.
tests changed: src/data/upload-queue.test.ts: red repair 1 (TL-P4-53 Q2): select records by member identity, not store position.
tests changed: src/data/upload-store.test.ts: red repair 1 (TL-P4-53 Q2): select records by member identity, not store position.
tests changed: src/data/vault/drive-vault.test.ts: red repairs 1-2 (TL-P4-53 Q2, addendum 3): release the store gate before awaiting addPile; the late arrival comes from a lost final answer.

## Fix round 1 red

Red-owning Codex session, 2026-10-10, TL-P4-29. Baseline HEAD:
`b715e3071d6846d65a7ddf7ec1899ccac96d0d72`. Finding: BLOCK 1 in
`docs/harness/2026-10-10-codex-upload-resume-after-reload-adversarial.md`.
No network, git writes, production edits or changes to existing assertions or bounds.

tests changed: src/data/upload-resume.test.ts: add a first-folder-declaration arrival race and pending-member positive control through public addPile()/piles(); preserve every existing assertion and bound.
removed: none.

Red name: `upload-resume-after-reload: fix 1: a member that arrives during the first declaration read needs no picker`.
Positive control: `upload-resume-after-reload: fix 1 control: a member still pending during the first declaration read needs no picker`.

Both schedules save one 10-byte Blob in a declared folder pile through real `addPile`,
hold the real transfer at offset 4, stop/dispose the first page, and construct a fresh
real queue/store/vault over the same fake IndexedDB and fake Drive. The saved record
retains its session and reserved file identity. The folder declaration is selected
by its exact pile stamp and folder anchor, and only its first bytes-read answer is held.
The first public `piles()` starts resumption. Promise barriers establish that both
the declaration answer and resumed chunk are outstanding before proceeding.

The positive control returns that first declaration answer while sending remains held:
the first full read has a queued member with nonnegative progress, no picker, and no
`not-arrived` reason. Releasing sending then verifies the original body arrives once
and its pending device record disappears.

The red releases sending while the declaration answer remains outstanding, awaits
real queue idle, and verifies the original body, one logical file, reserved identity,
completed queue state and cleared device record before returning the declaration answer.
The first full read then incorrectly returns both `chooseAgain: true` for that same
member and `setAside: 'not-arrived'`. One combined assertion reports both violations.
No refresh or second full read is used to hide the first answer. No real timers,
polling, queue substitutes or new production mechanisms were added.

Verification (all output redirected to `tmp-logs/`):

```sh
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/fix-1-red.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/fix-1-tsc-app.log 2>&1
pnpm exec eslint src/data/upload-resume.test.ts > tmp-logs/fix-1-eslint.log 2>&1
```

Whole requested file: **6 passed, 1 failed, 7 total**; exit 1. The only failure is
the new exact-name red on its intended assertion. The positive control and all five
existing tests pass. No timeouts, load failures or unhandled errors. App tsc and
touched-file eslint pass with empty logs; read-only `git diff --check` passes.
Full check/e2e and implementation belong to the next session and were not run here.

Research/reuse: inherited local packet and existing mechanism; no sources fetched.
Official references: [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable)
and [IndexedDB transaction lifetime](https://w3c.github.io/IndexedDB/#transaction-lifetime).
The real queue, resumable transport, write-once reconciliation and committed device
store remain the exercised mechanism homes. No existing contract contradiction was found
in the whole requested file. Coordinator owns commits.

## Fix round 1

Implementer: Codex, 2026-10-10. Baseline HEAD: `c9ee7774`.
Implements the Blocking first-folder-declaration completion race from the adversarial review.
No network, git-writing command, test edit, dependency change or shared harness edit.

The full `piles()` read records the existing `arrived` set's size before reading. Its single
publication decision checks whether a queue completion changed that evidence while the read
was outstanding, including a completed file whose queue event has not been processed yet.
If so, it repeats the full read using the existing updated listing, declaration/read caches
and accounting. This also refreshes the folder's children, which were captured before the
declaration read; merely suppressing the picker would still omit the arrived member.
No intermediate result is published. A member still pending keeps its existing queue row;
a completed member is accounted and shown from the listing updated by `fromQueue`.
Ordinary reads still do not wait for a gated account answer unless they need hydration.
No queue, store, completion ledger, protocol, lock, session fence or accounting rule was added.

removed: none; 0 production lines removed, 5 lines added in `src/data/vault/drive-vault.ts`.
tests changed: none.

### Red and green evidence

The committed red was run unchanged before editing:
`upload-resume-after-reload: fix 1: a member that arrives during the first declaration read needs no picker`.
It failed at `src/data/upload-resume.test.ts:391`: the first full read returned a picker
and `notArrived: true` instead of no picker and `notArrived: false`.
The pending-member control and the other five upload-resume tests passed before the fix.
After the fix, all seven tests pass, including the exact red and its pending-member control.

All command output is under `tmp-logs/`; only failures and aggregate results were inspected.

```sh
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/resume-fix1-reds-before.log 2>&1
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/resume-fix1-reds-green.log 2>&1
pnpm exec vitest run src/data --maxWorkers=2 > tmp-logs/resume-fix1-data.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/resume-fix1-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/resume-fix1-tsc-node.log 2>&1
pnpm exec eslint src/data/vault/drive-vault.ts > tmp-logs/resume-fix1-eslint.log 2>&1
pnpm exec vitest run src/data/vault/drive-vault.test.ts --maxWorkers=2 > tmp-logs/resume-fix1-vault.log 2>&1
```

- Before: 6 passed, 1 intended assertion failure; exit 1.
- After: upload-resume 7 passed; exit 0.
- Entire data suite: 4,147 passed across 78 files, 57.48 seconds; exit 0.
- Additional vault verification: 229 passed, 9.31 seconds; exit 0.
- App tsc, node tsc and touched-file eslint: exit 0, empty logs.
- Read-only `git diff --check`: exit 0.
- The complete data suite finished without failed tests or unhandled errors. No test contradicts
  this fix-round ruling; no assertion, fixture, bound or timeout was changed (TL-P4-51).

### Sources and remaining gates

No sources were fetched. Research is inherited from the packet/prep and existing code:
[Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable)
and [IndexedDB transaction lifetime](https://w3c.github.io/IndexedDB/#transaction-lifetime).
The existing queue's completion events update the existing listing; the existing read cache
keeps repeated unchanged declarations and file reads. The resumable transport, committed
device staging, reserved identity and write-once reconciliation remain unchanged.

Full `pnpm check` was not run: its harness fixture tests execute git-writing commands,
which the assignment prohibits. Browser e2e was not run in this no-network fix round.
No full-check mark or browser result is claimed. Coordinator owns commits and delivery gates;
independent review and designer U3 verification remain before entry close.


## Fix round 2 red

Red-owning Codex session, 2026-10-10. Baseline HEAD:
`5e6bbaf9a1c9f1eadc0e22d8d48132e592b2c35e`. Finding: BLOCK 1 in
`docs/harness/2026-10-10-codex-upload-resume-after-reload-adversarial-2.md`.
No production edits, network access, commits or git-writing commands.

Exact added names:

- `upload-resume-after-reload: fix 2: other-tab completion with pending read-back`
- `upload-resume-after-reload: fix 2: other-tab completion with resolved read-back`
- `upload-resume-after-reload: fix 2: same-tab completion`

tests changed: src/data/upload-resume.test.ts: added completion-window class sweep; page fixture accepts lock/bus injection.
All seven pre-existing tests, every existing assertion and every bound are preserved.
The same-tab case reuses the unchanged existing completion control.

Both other-tab cases save through public `addPile()`, interrupt the real queue at offset 4,
retain the reserved identity and bytes in fake IndexedDB, and start a non-owning page's first
public `piles()` read. The first folder-declaration answer is held after reading its bytes.
A separate owning real queue resumes the actual transfer against fake Drive; its actual
completion broadcast invokes the non-owner's bus listener. Only the resulting `getUploaded`
read-back is gated, never the owner's read-back. The gate keys on the completion broadcast,
not on an implementation requirement that reconciliation mark the member done early.

Before releasing the declaration, both cases verify one arrived file, original bytes,
reserved identity, removal of committed pending records and no completed first listing.
The pending case releases the declaration with read-back outstanding. A separate committed
IDB read supplies an event-loop checkpoint and captures any first listing published then.
It subsequently releases read-back so an implementation that waits for reconciliation can
finish too. The assertion checks the captured first result, never a later refresh masking it.
The resolved case opens read-back and awaits the queue's public completion notification
before releasing the declaration. Each result must contain the retained queued member or
reserved arrived file, without a picker or `not-arrived`. No timers, polling or new bounds.

Verification:

```sh
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/upload-resume-fix-2-red.log 2>&1
pnpm exec eslint src/data/upload-resume.test.ts > tmp-logs/upload-resume-fix-2-eslint.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/upload-resume-fix-2-tsc.log 2>&1
```

- Full file at HEAD: exit 1, **1 intended assertion failure and 9 passes**.
- Pending other-tab read-back is red: `picker` contains `chooseAgain: true`, `upload: -1`;
  `notArrived` is true instead of false. This is precisely BLOCK 1, without timeout,
  load error, unhandled rejection or timer-gate failure.
- Resolved other-tab read-back and same-tab completion are passing class controls at HEAD.
  They do not exhibit BLOCK 1; no artificial failure was added to make them red.
- All seven existing tests pass. No contradicting assertion was found in the full requested file.
- App TypeScript and touched-test ESLint pass (exit 0).
- The initial resolved-control assertion matched a declaration member key even though an
  arrived row uses the reserved Drive file ID. Corrected only that new assertion to accept
  the queued key or arrived ID; final results above contain only the intended failure.

Research is inherited from the packet and local mechanisms; no source was fetched:
[Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable),
[IndexedDB transaction lifetime](https://w3c.github.io/IndexedDB/#transaction-lifetime).
Existing queue, store, write-once and Drive implementations are used without replacement.
Implementation, commits, full check and e2e are left to the assigned sessions/coordinator.

## Fix round 2

Implementer: Codex, 2026-10-10. Baseline HEAD: `20705542`.
Implements the second adversarial review's completion-window class ruling.
No network, git-writing command, test edit, dependency change or shared harness edit.

The existing queue's other-tab reconciliation leaves each member `waiting` while its
reserved-file read-back is outstanding. Only a successful read-back publishes its file,
full byte count and `done` state together. An absent reservation or failed read-back
does not claim completion. A changed queue generation or removed entry rejects a late
read-back. Each confirmed member notifies the existing subscribers before reconciliation
can wait on the next member, so one slow read-back cannot hide another member's arrival.
The existing sender already completes only with a confirmed file; its path is unchanged.

`declaredState` takes its file snapshot and in-flight member keys synchronously at the
same point, after reading the declaration. The existing `accountPile` judges that file
snapshot; local-member decisions use those same captured queue facts. If accounting
finds a missing member, it still waits for existing queue hydration, then repeats the
same accounting from a fresh paired snapshot. Ordinary listings retain their ability
to finish before a gated account answer. The existing full-read publication guard and
completion subscribers still refresh children/accounting when arrival changes mid-read.
No queue, store, state machine, arrival ledger, protocol or second accounting rule was added.

removed: `src/data/upload-queue.ts`: 6 replaced/moved lines; premature `done`/full-progress assignment removed.
removed: `src/data/vault/drive-vault.ts`: 9 replaced/moved lines; separate file/queue decision snapshots replaced.
removed: no mechanism deleted; final production diff is 29 added lines and 15 removed lines.
tests changed: none.

### Red and verification

The committed tests ran unchanged before implementation. Exact failing name:
`upload-resume-after-reload: fix 2: other-tab completion with pending read-back`.
It failed at `src/data/upload-resume.test.ts:520`: the first full read returned a
`chooseAgain` row with `upload: -1` and `notArrived: true`. All nine other tests passed,
including the resolved other-tab and same-tab completion controls.
The final production change passes all ten tests, including that exact red and both controls.

All output is under `tmp-logs/`; only failure excerpts and aggregate results were inspected.

```sh
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/resume-fix2-reds-before.log 2>&1
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/resume-fix2-reds-final2.log 2>&1
pnpm exec vitest run src/data --maxWorkers=2 > tmp-logs/resume-fix2-data-final2.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/resume-fix2-tsc-app-final2.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/resume-fix2-tsc-node-final2.log 2>&1
pnpm exec eslint src/data/upload-queue.ts src/data/vault/drive-vault.ts > tmp-logs/resume-fix2-eslint-final2.log 2>&1
```

- Before: 1 intended assertion failure, 9 passes; exit 1.
- Final reload reds and controls: 10 passed, 2.68 seconds; exit 0.
- Final entire data suite: 4,150 passed across 78 files, 73.30 seconds; exit 0.
- Final app tsc, node tsc and touched-production-file eslint: exit 0, empty logs.
- Read-only `git diff --check`: exit 0.
- The complete requested data suite has no failed tests or unhandled errors. No test
  contradicts this ruling (TL-P4-51); every test, assertion, bound and timeout is unchanged.
- An intermediate data sweep was interrupted after an exploratory publication guard
  change was reverted; `resume-fix2-data.log` is not completion evidence. That guard
  would also have required already-observed, intentionally removed files to reappear.
  The original guard remains. The next sweep passed 4,150 tests across 78 files,
  44.01 seconds (`resume-fix2-data-final.log`), before per-member completion notification
  was added. The final sweep above verifies the completed change.

### Research and remaining delivery gates

No sources were fetched. Research/reuse comes from the packet/prep and existing mechanisms:
[Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable)
and [IndexedDB transaction lifetime](https://w3c.github.io/IndexedDB/#transaction-lifetime).
Retained session URI, server offset/status queries, reserved identity, committed device
staging and write-once reconciliation keep their existing homes.

Full `pnpm check` was not run: its harness fixture tests run git-writing commands,
which the assignment prohibits. Browser e2e and a full-check mark are not claimed.
Coordinator owns commits and delivery gates; independent review and designer U3 verification
remain before entry close. Production changes and these notes remain uncommitted.

## Fix round 3 red

Red-owning Codex session, 2026-10-10, TL-P4-53 addendum 4. Baseline HEAD:
`48ce0fd717ff537090f6433f7efc18be07540cfa`. Finding: BLOCK 1 in
`docs/harness/2026-10-10-codex-upload-resume-after-reload-adversarial-3.md`.
No network, git-writing commands, production edits or changes to existing assertions or bounds.

Red name: `upload-resume-after-reload: fix 3: two-tab reload, completion and takeover need no picker and no second create`.
Positive control: `upload-resume-after-reload: fix 3 control: two-tab reload after reservation needs no picker and no second create`.

tests changed: src/data/upload-resume.test.ts: add two-tab sibling hydration/completion/takeover regression and reserved-sibling positive control through public queue/vault calls; preserve every existing assertion and bound.
removed: none; 149 test lines added, no existing test line edited or deleted.

Both schedules use the real queue, real DriveVault, FakeDrive and fresh stores over the
same fake IndexedDB. Public addPile accepts a two-member pile with distinct 10-byte Blobs.
Promise barriers hold each member at chunk offset 4. In the red, tab 2's public piles/start
hydrates the later sibling while its reserved ID is null and confirmed offset is 0.
Tab 1 then completes the first member, reserves the later member and reaches its held chunk.
The first member's confirmed reconciliation and a committed IDB checkpoint establish that
tab 2 still has the later member with a null reserved ID. Tab 1 completes it and removes
its retained record. Original bodies, exact member identities, the later reserved file ID
and removal of both committed records are verified before takeover.

The positive control reloads tab 2 after the later member has its reservation and confirmed
offset 4. It otherwise follows the same completion and takeover schedule and assertions.
The first fixture run incorrectly expected offset 0 in this new control as well; corrected
only the new control's conditional expectation to its actual barrier offset 4. No existing
assertion or bound changed. A refresh before the final read initially concealed the picker;
the final regression reads public piles without refreshing away the stale member.

Completion broadcasts invoke the observer's real bus listener. A spy delegates every
getUploaded to real FakeDrive, holding only the observer's later reserved-ID answer after
actual read-back. The owner is closed; public queue.pause/start reproduce Use here's
retained-entry generation change and ownership acquisition for the same account/folder.
Committed IDB checkpoints capture the queued state and any listing offered before that
read-back answer is released. A corrected implementation may wait for read-back or show
an unfinished member; it must offer no picker or not-arrived reason. Final assertions require
the same queue/member identity, confirmed completion with the original reserved file,
observer read-back by that ID, no picker, no not-arrived and no further reservation/create.
The control additionally confirms exactly two original upload sessions and original bytes.
No polling, real timers, queue substitutes, production exports or new mechanisms were added.

Verification (all output redirected; only failures/tails inspected):

```sh
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/upload-resume-fix-3-red.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/upload-resume-fix-3-tsc.log 2>&1
pnpm exec eslint src/data/upload-resume.test.ts > tmp-logs/upload-resume-fix-3-eslint.log 2>&1
```

- Full requested file at HEAD: exit 1, **one intended assertion failure and 11 passes**.
- Exact new red fails at `src/data/upload-resume.test.ts:677`: member reconciliation,
  confirmed completion and reserved-ID observer read-back are false; piles returns the
  later sibling with chooseAgain true, upload -1 and setAside not-arrived. Drive receives
  no second create. The queue logs its expected lost-bytes BowerError during takeover.
- Positive control and all ten pre-existing tests pass. No timeout, load failure,
  unhandled rejection or timer-gate failure; no contradicting existing test in this file.
- App TypeScript and touched-test ESLint exit 0, empty logs. Read-only git diff --check passes.
- Production remains HEAD; only the new test additions and this requested notes section differ.
- Implementation, coordinator commits, full check, broader suites and e2e are left out.
  Full check's git-writing harness fixtures are outside this no-git-writes assignment.

Research/reuse is inherited from the packet and existing local mechanisms, without fetching sources:
[Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable),
[Drive pre-generated IDs](https://developers.google.com/workspace/drive/api/guides/manage-uploads#pre-generated-ids),
[IndexedDB transaction lifetime](https://w3c.github.io/IndexedDB/#transaction-lifetime).
Existing queue, store, resumable transport, write-once reconciliation and takeover calls
remain their mechanism homes. No second mechanism was introduced. Coordinator owns commits.

## Fix round 3

Implementer: Codex, 2026-10-10. Baseline HEAD:
`21d34ad4c056bd2e755445a1d3fe3edea76673a1`.
Status: done after the committed fixture repair and final requested verification.
Final verification HEAD: `bca0212db7d92ea4bc307e943f5d7eda5ffe529b`.
No network, git-writing command, test edit, dependency change or shared harness edit.
The retained production change passes the repaired reds without further adjustment; it remains uncommitted.

### Narrow candidate and reuse

The existing queue bus carries an optional completion with the full `uploadId` member
identity and reserved file ID. Ordinary change notifications remain supported, including
legacy `changed` messages. The browser bus validates the message shape before forwarding it.
On confirmed completion, the owner sends that identity through the existing broadcast after
removing the pending record. The listener matches the existing entry by its full identity,
and fills only a previously unknown reservation. It learns the reservation synchronously,
including while paused, before read-back waits or Use here changes the generation.
Discarded/forgotten entries are not recreated; an existing reservation is not replaced.

The existing refresh reads that reserved ID before publishing completion and before the
owner pump selects anything to send. Its generation/entry guards remain unchanged. The
existing missing-bytes branch still uses `arrivedFile` to verify the reserved ID, size and
hash before offering reselection. Neither path needs a second lookup mechanism or store.
The candidate adds no queue, store, state machine, completion ledger, Drive scan, protocol,
reservation allocator or session fence. No vault file or UI copy was changed.

removed: `src/data/upload-queue.ts`: 7 replaced lines; 28 lines added, no mechanism removed.
removed: payload-free bus signatures, browser forwarding and completion post replaced.
removed: combined scope/paused early return split to retain the reservation while paused.
tests changed: none.

### Previous contradiction (resolved by the committed red repair)

The previous complete data sweep found one contradicting test, recorded below for the fixture repair:

- `src/data/upload-resume.test.ts:701`:
  `upload-resume-after-reload: fix 3: two-tab reload, completion and takeover need no picker and no second create`.
  Its combined assertion at `src/data/upload-resume.test.ts:677` requires the observer
  to recover the sibling's unseen reservation and read it back by reserved ID. However,
  the injected owner bus at `src/data/upload-resume.test.ts:579` accepts no message;
  `src/data/upload-resume.test.ts:582` calls the observer without forwarding the completion.
  The callback variable at `src/data/upload-resume.test.ts:575` likewise accepts no payload.
  The fixture therefore discards exactly the member/reservation evidence the ruling says
  to communicate through the existing broadcast. The observer's existing record remains
  null after the owner removes the device record, and the narrow queue cannot recover an
  unknown ID from the payload-free notification. `ResumableClient` exposes read-back by ID,
  not a lookup by member. Adding a Drive scan or another store would exceed this ruling.

The reserved-sibling positive control passes because it already knows the ID. All earlier
fix-round reds and controls remain green. No assertion, fixture, bound or timeout was
weakened. A red repair that forwards the completion payload belongs to the lead/red owner;
this assignment explicitly prohibits any test change. That session stopped under TL-P4-51.
The committed fixture repair now forwards the payload; the regression and control pass.
No test was edited in this final verification session.

### Previous verification (before fixture repair)

All command output is under `tmp-logs/`; only failures and aggregate results were inspected.

```sh
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/resume-fix3-reds-before.log 2>&1
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/resume-fix3-reds-after.log 2>&1
pnpm exec vitest run src/data --maxWorkers=2 > tmp-logs/resume-fix3-data.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/resume-fix3-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/resume-fix3-tsc-node.log 2>&1
pnpm exec eslint src/data/upload-queue.ts > tmp-logs/resume-fix3-eslint.log 2>&1
```

- Baseline reds: 11 passed, one intended assertion failure; exit 1, 1.63 seconds.
- Candidate reds: 11 passed, the same sole failure; exit 1, 610 ms.
- Entire data suite: 4,151 passed, one failed, 4,152 total across 78 files;
  exit 1, 52.02 seconds. The sole failure is the contradicting red listed above.
- Final app tsc, node tsc and touched-production-file eslint: exit 0, empty logs.
  An initial app tsc found optional-payload narrowing errors; the explicit guard was
  corrected and app tsc rerun successfully. The guard has the same runtime behaviour
  as the candidate tested by the completed data sweep.
- Read-only `git diff --check`: exit 0. Tests are unchanged in the production diff.
- Full `pnpm check` was not run: its harness fixtures execute git-writing commands,
  which this assignment prohibits. No full-check mark or browser e2e result is claimed.
  Coordinator owns commits, delivery gates, independent review and designer U3 verification.

### Final verification (after committed fixture repair)

Final status: done for fix round 3. The retained `src/data/upload-queue.ts` change
needed no adjustment. No tests changed; no network or git-writing command was used.
The previous fixture contradiction is resolved. The full targeted suite has no
contradicting or failing test to list under TL-P4-51.

All output is under `tmp-logs/`; only failure patterns and aggregate results were read.

```sh
pnpm exec vitest run src/data/upload-resume.test.ts --maxWorkers=2 > tmp-logs/resume-fix3-final-reds.log 2>&1
pnpm exec vitest run src/data --maxWorkers=2 > tmp-logs/resume-fix3-final-data.log 2>&1
pnpm exec tsc -p tsconfig.app.json --noEmit > tmp-logs/resume-fix3-final-tsc-app.log 2>&1
pnpm exec tsc -p tsconfig.node.json --noEmit > tmp-logs/resume-fix3-final-tsc-node.log 2>&1
pnpm exec eslint src/data/upload-queue.ts > tmp-logs/resume-fix3-final-eslint.log 2>&1
```

- Reds: exit 0, all 12 pass, including every earlier fix-round red and control;
  1.02 seconds. The exact fix 3 regression and reserved-sibling control both pass.
- Entire data suite: exit 0, all 4,152 tests across 78 files pass; 65.09 seconds.
- App tsc, node tsc and touched-production-file ESLint: exit 0, empty logs.
- Read-only `git diff --check`: exit 0. Production diff and tests are unchanged
  from the start of this final session; only this notes section was updated.
- Full `pnpm check` remains unrun because its harness fixtures write git.
  Browser e2e, commits, independent review and designer U3 verification remain
  coordinator-owned; no full-check mark or browser e2e pass is claimed.

### Sources

No sources were fetched. Research is inherited from the packet/prep and local mechanisms:
[Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable),
[Drive pre-generated IDs](https://developers.google.com/workspace/drive/api/guides/manage-uploads#pre-generated-ids),
and [IndexedDB transaction lifetime](https://w3c.github.io/IndexedDB/#transaction-lifetime).
The existing reserved identity, read-back, confirmed completion and committed device
staging remain their mechanism homes. The final session verifies the repaired regression is green without fetching sources.

## Fix round 3 red repair

Red-owning Codex session, 2026-10-10, TL-P4-53 addendum 4.

tests changed: src/data/upload-resume.test.ts: TL-P4-53 addendum 4: the fake bus forwards the completion payload like the real broadcast

Only the sibling takeover fixture's injected bus callback type, post parameter and
forwarded callback argument changed. Every assertion, bound, positive control and
other test remains unchanged. The implementer's uncommitted production candidate
was not edited. No network or git-writing command was used; coordinator owns commits.

Verification, output redirected to tmp-logs/:

- Before repair: full file, --maxWorkers=2, exit 1; the assertion at line 677 failed,
  with 11 passes. Log: tmp-logs/resume-fix3-repair-before.log.
- After repair: full file, --maxWorkers=2, exit 0; all 12 tests passed, including
  the exact fix 3 regression and its positive control.
  Log: tmp-logs/resume-fix3-repair-vitest.log.
- App tsc (--noEmit) and touched-test eslint: exit 0.
  Logs: tmp-logs/resume-fix3-repair-tsc.log and tmp-logs/resume-fix3-repair-eslint.log.
- Read-only git diff --check passed. Full check and e2e remain coordinator-owned;
  full check includes git-writing harness fixtures prohibited by this assignment.

Research/reuse: existing QueueBus and browser broadcast forwarding in
src/data/upload-queue.ts; no sources fetched and no second mechanism introduced.

## Designer verified (TL-P4-18 addendum 3)

Designer, on fake at 1440 and 375 (a1931e9e build 0824a800): a 2-PDF pile with each chunk slowed 1.5 s, reloaded mid-send; the pile showed "Sending…" for the unsent one for about 2 s, then "From this device"; no file picker (0 filechooser events), no "Choose the file again" or "Didn't arrive"; the storage wording unchanged. verified.

## Known-green close (coordinator)

done.sh could not revert dfa2f8de (fix rounds 1-3 touched the same lines of drive-vault.ts and upload-queue.ts). The red is proved by hand: at dd0b8dfb all five reds failed on their assertions (the Reds section), and each fix round committed a red that failed at its HEAD (fix 1, fix 2, fix 3; this notes file). After the fix: the 12 upload-resume reds pass, data 4152/4152; pnpm check green; e2e app/capabilities demo 35 and fake 59; Codex pass 4 PASS; P4-99 PASS; designer verified.
