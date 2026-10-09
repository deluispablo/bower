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
| `src/data/spine/barrier.ts:193` (app, write by stamp) | resent after 429/401 | sent once, fails `retry` (its retry path: not checked here) |
| `src/data/vault/journal.ts:509` (app, Bin by stamp, finding 2) | resent | sent once, fails `retry` (outbox handling: not checked here) |
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

- The two unfenced app writes (barrier, journal Bin) get no fence here; journal is finding 2, logged separately.
