# transport-retry-skips-fence (diagnosis, 2026-10-09)

Defect log: `docs/harness/DEFECT_LOG.md:65` (claude/p3). Source: Codex TL-P3-16 finding 1. Read-only diagnosis; no code edited.

## What failed

The claim holds for rate limits. It does not hold for a 5xx on a write.
- `DriveHttp.call` (`src/data/drive/drive-http.ts:461`) gives every non-GET the `again` = "not `mayHaveLanded` and `askAgainNow`". So a write
  answered 429, or 403 `rateLimitExceeded`/`userRateLimitExceeded`, goes back into `send` (`transport.ts:119-121`). There it waits
  `rand*500*2^n` ms (caps 0.5, 1 and 2 s) and sends the same `RequestInit` again, up to 3 more times. A write has no time budget (`transport.ts:107`).
  A write that gets a 5xx is **not** sent again: `mayHaveLanded` returns it as unconfirmed (`drive-http.ts:101`, test `drive-http.test.ts:211`).
- Writes on this path: `writeText` (195, media PATCH; 445 multipart PATCH), `update` (203: move and rename), `trash` (208), `untrash` (213),
  `createFolder`/`createText` (POST by reserved id), `generateIds` (the GET carve-out does not cover it, so it is retried too: harmless).
- Each caller's precondition runs once, before `send`: `writeText`'s own get-and-compare (`drive-http.ts:192-193`), the runner's fence
  (`runner/src/drive.ts:298-304`: attempt, target and destination, then `write()` at 311), and the app's `stillAsSeen` (`drive-vault.ts:1722`).
- **Reproduced (unit, scratch, not committed).** `DriveHttp.writeText('f1','bower body','T1')`: the first GET sees T1, and the PATCH answers 429 after
  the stored file changes to "person edit"/T2. The second PATCH lands. The final text is "bower body": 1 GET, 2 PATCHes, test passed. A 403
  `userRateLimitExceeded` on `update` (a move) is also sent twice without a read.
- **What Drive does.** Drive does not enforce a precondition on the resend. v3 `files.update` documents no If-Match. The v2→v3 reference lists
  Files `etag` as "n/a" in v3 (https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference). The "Resolve errors" guide names no
  412/conditionNotMet and tells callers to back off and retry 429 (https://developers.google.com/workspace/drive/api/guides/handle-errors).
  The repo's live R1 run (2026-10-05, `docs/harness/2026-10-05-r1-remedy-options.md`) saw a stale media PATCH answered 200, which overwrote
  confirmed competing bytes. The ETag line was then closed (TL-P2-05). The md5 in `write-once.ts` checks only after the write
  (`confirms`, line 28). The `bowerOp` stamp is a key for reading the write back. Neither is a precondition. The docs only imply that
  "a 429 did not land" (the guide says to retry). They do not state it.

## Why (5 whys)

1. Why was the edit overwritten? The transport sent the same PATCH again after the wait and did not read the file first.
2. Why no read? The check and the send live in two homes. The check is in the caller; the retry loop sits below it in `send` and knows only the request.
3. Why does the transport send a write again at all? Its policy (`transport.ts:11-15`, `drive-http.ts:458-461`) decides from the answer
   alone. A rate limit "did not land", so it treats the resend as the same request.
4. Why is that wrong here? The resend is idempotent for Bower's own effect, but not for other writers. Drive v3 holds no
   precondition for these writes. The precondition exists only in the caller's read just before the first send.
5. Design cause: the owner accepted a short read→write window (GOVERNANCE 2026-10-06, R1) on the premise that a check comes right before
   **each** send. The transport's retry rule for writes was made without that premise. A resend stretches the window by the backoff
   (≤3.5 s) plus up to three round trips. In the runner it also passes the attempt check, so a takeover during the wait does not stop it.

## Owner mechanism

Drive transport (`src/data/drive/`, retry policy: `transport.ts` `send` and `DriveHttp.call`'s `again`). The invariant it breaks is the
still-as-seen fence (`src/data/contracts/still-as-seen.ts`: "the one check, right before a write"). Neither write-once nor the
failure table (`answerKind`) is at fault.

**A second retry path?** No other Drive write retry exists. The runner's status and token calls (`runner/src/status.ts:123`,
`token.ts:114`) go through the same `send`. The journal (`journal.ts:394`) and the upload queue retry later and re-run their checks; they
send only creates by reserved id, and Drive refuses a reused id (409). `api/src/github.ts:84` has its own backoff loop for GitHub
dispatch. It is not Drive and not this class, but it is a second backoff implementation (whether a ruling covers it: unverified).

## Same class elsewhere: a check run once, then a send repeated or delayed with no new check

1. `src/data/drive/drive-http.ts:367-381`: after a 401 the write is sent again after a token refresh (in the runner, a call to the Worker), with no new check.
2. `runner/src/drive.ts:298-311`: the fence (attempt and target) runs once per `write()`, so the attempt is not read again before a resend after a takeover.
3. `api/src/vault.ts:178`: the Worker's `replaceText` of the person's `Rules.md`, through `writeText`, gets the same rate-limit resend.
4. `src/data/vault/drive-vault.ts:326/329, 347/348, 1066→1097/1101`: `stillAsSeen` runs, then `update` (move or rename), which can be resent after the wait.
5. `src/data/drive/drive-http.ts:358-359`: `raw()` resends resumable open and chunk requests on 429 **and 5xx**. These are creates by reserved id
   or byte ranges, so nothing is overwritten. Only the parent checked by the fence may have moved (low).

Related but logged separately: `drive-vault.ts:1747` and `journal.ts:505` have no fence at all (finding 2).

## Options

- **(a) Fix in the owner. Size S, risk medium.** In `DriveHttp.call`, a write to an existing file (PATCH `files/{id}`: `writeText`, `update`,
  `trash`, `untrash`) is never sent again by the transport, after a rate limit or after a 401 refresh. It fails as a `retry`-kind error,
  which already exists ("did not land for now"). The caller's existing later-try path resends it after its own fence:
  - the runner: the attempt stops, and recovery reads the write back by its stamp, then sends it once under the fence (`engine.ts:214-236`);
  - the app: the person is told to try again, and the next try re-runs `stillAsSeen`;
  - the Worker: the route fails (who retries it: unverified).
  Creates by reserved id and `generateIds` keep their resend: Drive enforces the id (409). This only removes a path; it adds none.
  Change `drive-http.ts:461` and the 401 loop at 367-381, then the header at `transport.ts:11-15`, and update the tests.
  Risk: under rate-limit bursts a run stops and needs a new attempt (how a new attempt is started: unverified), and the app shows an
  error where it used to succeed after a short wait. A UI sentence may change, so the designer is consulted.
- **(b) Refactor first, then fix. Size L, risk medium-high.** Make "check, then send" one step in the transport. `send` runs a fence
  callback before every send, and the write ports take the `SeenExpectation` they were read with. The three copies of "read, then compare"
  fold into that one call: `DriveHttp.writeText:192-193`, `RunnerDrive.fenced:298-304` and `DriveVault.stillAsSeen:1722`.
  A rate-limit resend then re-runs the fence, including the runner's attempt check. This touches every write port, `FakeDrive` parity
  (`c2-fake-parity`), the runner's `peeked`/`generation` handling and the Worker. The window stays a precheck per send, not a CAS.
- **(c) A new mechanism: none.** Both the retry home and the fence exist. A server-enforced precondition (If-Match) is not available
  in Drive v3, and the ETag line is closed (TL-P2-05). Adding a separate re-check wrapper around the transport would be a second fence.

## Regression test (class)

Add one table-driven unit test over every write port (`drive-http.test.ts:198`, the `writes` table), the runner's fenced writes and the
Worker's `replaceText`. A fetch stub refuses the first write with each answer that may be resent: 429, 403 `rateLimitExceeded`/
`userRateLimitExceeded` and 401→refresh. After the refusal, the stub changes the stored `modifiedTime`, `name` or `parents`, or the
runner's current attempt. The test asserts that no later non-GET request to the same `files/{id}` reaches Drive unless a fence read of
that id (and, in the runner, an attempt read) happened after the change and passed. Name: "every write sent is preceded by its own
still-as-seen check".
