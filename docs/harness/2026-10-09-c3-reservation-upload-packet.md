# Packet: c3-reservation-upload (stage 3)

- **Entry:** `c3-reservation-upload`. Ruling: TL-P4-17 addenda 1 and 3 (DECISIONS). Worktree `/private/tmp/bower-c3-up`, branch `c3-reservation-upload` from `claude/p3`.
- **Starting model:** `bower-escalated`. Write-once is a data-safety home, and a lost reservation makes a second file.
- **Live evidence:** P4-39 found the upload queue reserving its own id. At `src/data/upload-queue.ts:431` it calls `fenced.generateIds(1)` and keeps the id on the device upload record (`keepFileId`), beside write-once's `Holder`/`Intended`/`makeOnce` (`src/data/spine/write-once.ts:120-200`).

## Contract

- **One home.** The upload queue reserves and keeps its id through write-once. The port's keeper is the device upload record (`store`), next to the journal outbox line and memory. Write-once keeps no second store.
- **The allowlist shrinks by one.** `upload-queue.ts` leaves the reservation rule's per-file overrides (in ESLint once c3-test-time lands; the rule in `write-once.test.ts` until then). Growing the allowlist must still fail.
- **Behaviour unchanged:**
  - the id is kept on the device before the first byte is sent, so a reload never reserves another;
  - a storage refusal demotes the item to memory with today's message;
  - lost bytes still ask to choose the file again;
  - resumable sessions and confirmed bytes are untouched.
- **Out of scope:** `api/src/vault.ts` (c3-reservation-worker) and the batch sites. Goldens never rise. `removed: <lines>` goes on the card.

## Red

A test that the upload's reservation goes through the write-once home and keeps the id on the device record. It fails today, because upload-queue calls `generateIds` itself.

## Verify (exact, from features.json)

- "an upload reserves its file id through the write-once home and keeps it on the device"
- "an upload whose reply was lost is found again by its kept id after a reload"
- "lost bytes ask to choose the file again"
- Real entry point (TL-P4-17): e2e:fake "a file added again after a reload is not doubled"

Then `pnpm check` must be green.

## Checklist

- Match by id, never by name.
- The red reproduces the drift.
- Every sentence is backed by a test.
- The card names the exact tests.
- Research first: cite Drive `files.generateIds` and the resumable upload protocol.
- Reviewers: read-only, never `git checkout` in the main repo (the hook blocks most forms; a subshell, `pushd` or `GIT_DIR` are still forbidden).
