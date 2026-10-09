# c4-retry-fence implementation notes

implementer: claude (bower-escalated)
red: a6ea6210 (tests only)
fix: 9d193972

tests changed: src/data/drive/drive-http.test.ts: added the `a resend of a write to an existing file` describe block
(four tables) and imports; no existing test edited or removed.
tests changed: src/data/vault/drive-vault.test.ts: added `a write resent after a rate limit` (three tests) and the
`DrivePatch`, `WriteOptions` type imports; in the fix commit its port override became `Object.assign` so it type-checks
(the pretend Drive's `update` takes no options). No existing test edited.
tests changed: runner/test/drive.test.ts: added `a fenced write resent after a rate limit` (three tests); nothing edited.
tests changed: runner/test/main.test.ts: added `the runner process under a rate limit` (one test); nothing edited.
tests changed: api/test/vault.test.ts: added `POST /vault repairs Rules with a fence before any resend` (two tests).
tests changed: src/data/spine/write-once.test.ts: the structural check of app writes now accepts `(op, fence) =>` as
well as `(op) =>`; it still requires every app write to go through the stamp helper. Not weakened: the same lines
must match, only the callback's second parameter is new.

## What changed (contract points 1 to 4)

1. The retry stays in its one home. `send` (`transport.ts`) gains `beforeResend`, awaited at the top of every send
   but the first (outside the fetch's own catch). `DriveHttp.call` decides it: a PATCH (every PATCH here is
   `files.update` of `files/{id}`, keyed by method and target) gets `again` only when it carries a fence.
2. `writeText`, `update`, `trash`, `untrash` and the multipart PATCH take `WriteOptions { fence?: Fence }`
   (`drive-api.ts`). `DriveHttp.writeText`'s fifth parameter is now `{ current?, fence? }` (was `current`).
   - Rate limit (429, 403 rateLimitExceeded/userRateLimitExceeded): the fence runs after the backoff, right before
     the resend. 401: the token is refreshed, then the fence runs, then the resend (`authorized`).
   - A throwing fence is carried through the transport's catch untouched (`FenceRefused`), so the caller gets its own
     not-as-seen error (app: `CHANGED_ELSEWHERE`, conflict; runner: conflict or stale attempt; Worker: conflict).
   - No fence: sent once. A rate limit fails as Drive answered it (`retry`). A 401 refreshes the token for the next
     try and fails `driveFailure('unknown', 'retry')`, unsent, with a console line.
   - `raw()` is unchanged.
3. Creates (POST) are unchanged. By reserved id they are resent after a rate limit as before (guard test). Without
   an id they are also resent after a rate limit (and a 401 refresh) exactly as today: a rate limit says it did not
   land, so the resend makes one file; a 5xx is not resent (unconfirmed). `generateIds` (a GET) is unchanged.
4. Fenced callers: the app's `once` builds the resend fence from the same `seen` and `landing` it checks first and
   hands it to every write (`(op, fence) =>`, 10 sites); the runner's `fenced` runs its check (attempt, target, and
   destination) once before the send and passes the same function for the update, trash and write-text; the
   Worker's `replaceText` passes `checkStillAsSeen` on the file read by id (`isNoAnswer` re-exported by the adapter,
   TL-P3-21). `SeenFiles.wrap` forwards the options. No second retry path.

## Compatibility rows (existing-file writes with no fence: now sent once, then `retry`)

| Caller | Before | Now |
| --- | --- | --- |
| `src/data/spine/barrier.ts:193` (runner, write by stamp; corrected in the fix round) | resent, no new check | fenced through `RunnerDrive.fenced` (`save.batch()` is the runner's `FencedDrive`) |
| `src/data/vault/journal.ts:512` (app, Undo's Bin by stamp; fixed in the fix round) | resent, no new check | fenced: its `checkStillAsSeen` is the `fence` |
| `src/data/fake/fake-worker.ts:337`, `fake/*.ts` | FakeDrive, no transport | unchanged |
| runner `engine.ts`, `retention.ts`, `rules-repair.ts` | resent, no new check | fenced through `RunnerDrive.fenced` |
| app `once` (move, rename, Bin, unbin, text, pile note) | resent, no new check | fenced |
| Worker `replaceText` | resent, no new check | fenced |
| creates by id, creates without id, `raw()` uploads | resent after a rate limit | unchanged |

Goldens: `runner/test/drive-calls-golden.test.ts` C04 78 and 25-runs 88 pass unchanged (no rate limit in them).

## Sources

- Drive "Resolve errors" (back off and retry 429/403 rate limits): https://developers.google.com/workspace/drive/api/guides/handle-errors
- No If-Match on Drive v3 files: https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference
- RFC 9110 9.2.2, only idempotent requests are repeated automatically: https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2

## Left out

- (Superseded by the fix round below: barrier was already fenced; the journal Bin is now fenced.)

## Fix round (P4-55)

implementer: claude (bower-escalated, fresh session); red: de8a7c82 (tests only); fix: 6fafcc84

tests changed: src/data/vault/journal.test.ts: added `c4-retry-fence fix round: an Undo resent after a rate limit`
(two tests) and the `WriteOptions`, `notAsSeenReason` imports; no existing test edited or removed.
tests changed: src/data/vault/drive-vault.test.ts: added `a restore whose journal PATCH gets a 429 still finishes` to
`a write resent after a rate limit`; no existing test edited or removed.

1. `vault/journal.ts` (Undo's Bin, `removeNow`): its one `checkStillAsSeen` (place as listed, `landing(file, 'bin')`)
   runs before the first send, as before, and the same function is passed as `fence` on `trash` through
   `WriteOptions`. A 429, a 403 rate limit or a 401 refresh runs it again before the resend: moved, renamed or binned
   elsewhere, nothing is resent and Undo fails with `CHANGED_ELSEWHERE`; still as listed, the resend lands. No second
   check and no second retry path (the resend stays in the transport). A restore whose journal PATCH gets a 429 now
   finishes: the item is unbinned and its record leaves.
2. `spine/barrier.ts:193`: the round-1 row was wrong. `save.batch()` is the runner's `FencedDrive`
   (`runner/src/drive.ts` `batch()`, `RunnerDrive.fenced`), so that write already carries its fence. Row corrected.
3. Other callers that can hit a retryable refusal, swept by `grep` of `.trash(`, `.untrash(`, `.update(`, `.writeText(`
   and every `PATCH` in `src`, `runner/src`, `api/src`: none left unfenced on the transport.
   - App `once` (move, rename, Bin, unbin, text, pile note: `drive-vault.ts` 328, 346, 494, 1101, 1105, 1111, 1113,
     1141, 1773, 1776): fenced. `SeenFiles.wrap` forwards the options.
   - Runner `spine/engine.ts` 512-525, `rules-repair.ts` 56-57, `spine/retention.ts` 133-142, `barrier.ts` 193: through
     `RunnerDrive` (`runner/src/drive.ts` 110-114), fenced.
   - Worker `replaceText` (`api/src/vault.ts` 182): fenced.
   - `fake/fake-worker.ts` 337, `fake/fake-run-service.ts` `batch`: FakeDrive, no transport, no resend.
   - `drive/drive-contract.ts`: the drive contract tests' own direct writes (no fence: sent once). Not a production
     caller.
   - Creates (by reserved id, without id) and `raw()` uploads: unchanged, as in round 1.

### Compatibility rows (fix round)

| Caller | Before (round 1) | Now |
| --- | --- | --- |
| `vault/journal.ts` Undo's Bin | sent once, a 429/403 rate limit or 401 fails `retry` | resent after its fence passes; refused `CHANGED_ELSEWHERE` |
| `DriveVault.restore` (journal record's Bin) | a 429 left the item unbinned and its record kept | finishes |
| `spine/barrier.ts:193` | (row was wrong) fenced through `RunnerDrive.fenced` | unchanged |

Verify: the three reds; round-1 files `drive-http.test.ts` (136), `drive-vault.test.ts` (215), `write-once.test.ts`,
`runner/test/drive.test.ts`, `runner/test/main.test.ts`, `api/test/vault.test.ts`; goldens
`runner/test/drive-calls-golden.test.ts` C04 78 and 25-runs 88 pass unchanged.

Sources: Drive "Resolve errors" (retry 429/403 rate limits with backoff),
https://developers.google.com/workspace/drive/api/guides/handle-errors ; RFC 9110 9.2.2,
https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2
