# Packet: c4-retry-fence (stage 4, TL-P4-24, data safety, ahead of V2)

- **Entry:** `c4-retry-fence` (escalated). Worktree `/private/tmp/bower-c4-retry`, branch `c4-retry-fence` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-24 (main 8aa4205c), finding 1, option (a);
  - the diagnosis [transport-retry-skips-fence](defects/2026-10-09-transport-retry-skips-fence.md), source of the class test;
  - the Codex review finding ([review](2026-10-09-codex-p3-review.md));
  - AGENTS hard rules: every content write passes the modifiedTime it read, a move or rename checks stillAsSeen, Bin only;
  - TL-P4-20 trial: the reviewer signs off the contract before implementation.
- **Review:** an escalated Claude reviewer plus one Codex read-only review pass (TL-P4-23 ruling 6).
- **Starting model:** `bower-escalated`.

## Contract (TL-P4-24 addendum 2, main 91c006e1)

**Order.** This entry runs after c4-app-fence has merged. Merge claude/p3 first, so `once` and the app writes already carry their fence.

1. **The retry stays in its one home:** `drive-http.ts:461` (transport send).
2. **A `fence` option on existing-file writes.** `writeText`, `update`, `trash`, `untrash` and the multipart PATCH (`drive-http.ts:444`) take an optional `fence: () => Promise<void>`.
   - The transport awaits it before each resend after a 429/403 rate limit or a 401 refresh (`:367-381`), never before the first send.
   - If the fence throws, the call ends with the caller's own not-as-seen error. There is no resend.
   - With no fence, the write is sent once. A resendable refusal then fails as retry-kind.
   - `raw()` (`:358`) is unchanged.
3. **Creates by reserved id keep their resend.** Meaning: a create sent with a reserved id (write-once `createById`) is resent as today, because a resend under the same id cannot make a second file. Creates without an id are unchanged, and the worker states what they do today.
4. **Every fenced caller passes its fence.**
   - The app: `once` and the writes c4-app-fence fenced, through `contracts/still-as-seen.ts`.
   - The runner's fenced writes (`runner/src/drive.ts:298-311`), whose fence moves the attempt check before the resend.
   - The Worker's `replaceText` (`api/src/vault.ts:178`).
   - No second retry path.

## Red and verify (exact names and files)

- `a resent write to an existing file runs its fence first` (`src/data/drive/drive-http.test.ts`, the table over the `writes` table).
  - A fetch stub refuses the first write with 429, with 403 rateLimitExceeded or userRateLimitExceeded, and with 401 followed by a refresh.
  - Then it changes the stored modifiedTime, name or parents.
  - The fence must refuse, the resend must not happen, and Drive must be unchanged. This fails today.
- `a passing fence still lands the resend` (same file).
- `an unfenced write is sent once and fails as retry-kind` (same file).
- `creates by reserved id are still resent after a rate limit` (same file). This is a guard that passes today and must keep passing.
- The 401 row holds the refresh path. The runner row moves the attempt between the 429 and the resend (`runner/test/drive.test.ts` or the runner's fenced-write test).
- Entry-point tests:
  - the app's move and rename under a 429-then-changed target (`src/data/vault/drive-vault.test.ts`);
  - the runner's `main` with a fenced write (`runner/test`);
  - the Worker route's `replaceText` (`api/test`).
  - Name the tests on your card.
- `pnpm check` passes. Goldens: C04 78 and 25-runs 88 (`runner/test/drive-calls-golden.test.ts:21,69`).

## Commits

The red (tests only), then the fix, then the notes in their own commit, with `tests changed:` lines and compatibility rows. The card carries `worktree:`. Every gate runs under `bash harness/with-lock.sh`.

Reviewers are read-only. They never move the main checkout.

## Contract review pass 1 (2026-10-09)

# c4-retry-fence contract sign-off (claude/p3 read through git show)

Verdict: CHANGES (no design given; each item is a contract gap).

1. Point 2 relies on "the caller's fence callback". None exists. `send` (transport.ts:103-123) and `DriveHttp.call`
   (drive-http.ts:457-467) take no fence, and `update`/`trash`/`untrash` (drive-http.ts:199-214, drive-api.ts) carry no
   expectation. The diagnosis calls option (a) "never resend"; the packet's text is option (b). Say which, and per
   write what the fence is and what error a refusal returns (conflict, or the stillAsSeen error). Else untestable.
2. "`once` ... pass their fence, so no new error" is false in code. Fence before `once`: move 326, rename 347,
   pile 1066 only. None before toBin/fromBin (1747-1748), 467, 493 (only writeText's own compare, 192-193), 1108-1138.
   Per point 2 they would fail as retry-kind: a new error for the person on a 429. The packet must list them
   (fence them, or accept the error and its sentence; the diagnosis says finding 2 is separate) and name the test.
3. Red covers refusal only. Nothing proves that a resend whose fence passes still lands (point 2 bullet 1), so
   "never resend" passes the red. Add: fence passes, so the second PATCH lands and the answer is returned; and
   no fence, so exactly one write and a retry-kind error. Real entry points per TL-P4-17: drive-vault move/rename
   with a 429, the runner's main/fenced write, the Worker route; the red names only the ports.
4. Point 3 "creates by reserved id" is ambiguous. `multipart` (444-445) uses `id` for a PATCH of an existing file
   (writeText with appProperties), so key it by method and target, not by an id being present. createText/createFolder
   without an id (test table row drive-http.test.ts:203) is unspecified. Resumable `raw()` (358-359) resends on
   429 and 5xx; point 4 says every site passes a fence or fails retry-kind, point 3 says creates resend. Say raw()
   is unchanged (or what).
5. Verify names "creates by reserved id are still resent after a rate limit": no such test exists on claude/p3.
   Give its file, and say it is a guard that passes today (not part of the red). Name the class test's file too;
   the diagnosis calls it "every write sent is preceded by its own still-as-seen check".
6. Red fails today for the stated reason (resend lands: 2 PATCHes after the stored change, diagnosis repro) for
   writeText/update/trash/untrash on 429 and 403 reasons. 401: in `authorized` (367-381) the resend after refresh
   has no check; the red must hold the 401 stub so the refresh path is the one resent. Runner row: the attempt check
   is in RunnerDrive.fenced (runner/src/drive.ts:293-311) and is run once, so the row must move the attempt
   between the 429 and the resend; name that file.
7. Goldens exist and match: runner/test/drive-calls-golden.test.ts:21 (78) and :69 (88; ACTIVE.md:450 says 85, test is 88).
   Extra fence reads on a resend do not change them unless the fake rate-limits; fine.
