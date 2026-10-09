# c3-reservation-upload: implementer notes

- Red `ad081c3f` (tests only), fix `8bf4de75`, from `claude/p3` 04177cc8.
- Red: "an upload reserves its file id through the write-once home and keeps it on the device" failed with
  `expected "vi.fn()" to be called 1 times, but got 0 times` (makeOnce watched by a pass-through `vi.mock`); the
  allowlist ratchet failed with the 4 upload-queue sites (228 gives, 286 sets, 432 calls for ids, 436 sets) once
  `'src/data/upload-queue.ts': 4` was removed from `ALLOWED`.

## Change

- `src/data/spine/write-once.ts`: `heldAs(id | null): Holder`, the holder for a keeper that stores the id in its own
  shape (the upload record's `fileId`); the `Holder` doc names the upload record as a port. `reserveFor` and `makeOnce`
  take an optional `signal`, passed to `generateIds(count, signal)`, so a stop still aborts the reservation as before.
- `src/data/upload-queue.ts`: the inline `fenced.generateIds(1)` is gone. The send is
  `makeOnce(heldAs(record.fileId), fenced, create, undefined, controller.signal)`; `create(id)` keeps the id on the
  device record (`keepFileId`, unchanged: storage refusal demotes to memory with today's message, a double failure
  fails the try) before `sendResumable` sends the first byte. A kept id is reused (no reservation).
- `QueueItem.reserved` renamed `fileId`: it is a read-only mirror of the record's `fileId`, never a holder.
  Consumers in `src/data/vault/drive-vault.ts` (6 lines) and one assertion in `upload-queue.test.ts` follow.
- removed: upload-queue.ts:430-437 (the `generateIds` call, `driveError` check and `item.reserved = id`), plus the
  `driveError` import. Prod +57/-43 (write-once +14/-7, upload-queue +37/-30, drive-vault +6/-6).

## Unchanged behaviour, and one note

- Lost bytes, resumable sessions and confirmed bytes are untouched (data suite 3573 pass).
- makeOnce lets the holder's id go on a permanent refusal; the holder here is per try, built from the record, and the
  record keeps its `fileId` as before. So a refused upload still retries under its kept id (today's behaviour). Whether
  a refusal should clear the record's id is a design question left to the lead.

## Gates

- verify vitest: 3 passed (`/tmp/c3-up-verify.log`); e2e:fake "a file added again after a reload is not doubled":
  2 passed, phone and desktop (`/tmp/c3-up-e2e.log`); `pnpm check` exit 0 (`/tmp/c3-up-check.log`): duplication 217
  lines / 1996 tokens (= baseline), unused 5 (= baseline), 23 lint warnings all pre-existing in untouched files.

## Sources

- Drive `files.generateIds`: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds
- Resumable upload: https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable

## Fix round (TL-P4-17 addendum 7, option a; P4-40 PASS with minors)

- Merge `aa31fcef` (claude/p3, c3-test-time): conflict only in `write-once.test.ts`, taken from claude/p3 (the rule is
  ESLint now). `src/data/upload-queue.ts` removed from `ALLOWED.root` in `scripts/eslint-reservation.mjs`;
  `ALLOWED_MAX` 9 -> 8 and its ceiling in `write-once.test.ts` 9 -> 8. No design choice needed.
- Red `f515f213`: "an upload refused for good releases its id from the device record" (`upload-queue-real.test.ts`;
  the fake Drive gains `refuseOpen`, a 403 `insufficientFilePermissions`, permanent in the transport's table). Failed:
  `expected { ... } to match object { state: 'failed', fileId: null }`, received `fileId: "RESERVED_1"`. The test then
  reloads and asserts a new id is reserved (`ids`, `open:<new>`), one file under it, done.
- Fix `80548be1`: the port `Holder` gains `letGo?: () => Promise<void>`; `makeOnce`'s one release rule (`releases`)
  does `delete h.reserved` then `await h.letGo?.()`, for every keeper. `heldAs(id, letGo)` takes the keeper's release;
  upload-queue passes `letFileIdGo`, which clears the record's `fileId`, `session` and `confirmed` (they belong to the
  refused id), the item's mirror, and saves through the existing `save` (a storage failure demotes, as today).
  The verify assertion `toEqual({ reserved })` on makeOnce's holder became `toMatchObject` (the holder now carries letGo).
- removed: write-once.ts `if (releases(...)) delete h.reserved;` (one line, now a block) and the old `heldAs` line.
  Prod +21/-4 (write-once +9/-3, upload-queue +12/-1).
- Left out: P4-40 minor 4 (options object for makeOnce): not one line; it changes the signature and callers in
  `src/data/vault/journal.ts` (outside this packet) and upload-queue.
- Gates: verify 4 passed (`/tmp/c3-up-verify.log`); unit write-once/upload-queue*/vault 397 pass (`/tmp/c3-up-unit.log`);
  `pnpm check` (`/tmp/c3-up-check.log`) green up to check-harness, which under load 11 flagged three untouched tests as
  slow; rerun on an idle machine (load 3.7) passed (`/tmp/c3-up-harness.log`), then bundle and landing passed
  (`/tmp/c3-up-tail.log`). Duplication 1996 tokens (= baseline), unused 5 (= baseline), lint 0 errors.
  e2e:fake "a file added again after a reload is not doubled": 2 passed (`/tmp/c3-up-e2e.log`).
