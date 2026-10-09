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

## Contract

1. **The retry stays in its one home,** `drive-http.ts:461` (transport send).
2. **Fenced resends only.** A write to an existing file is resent only through the caller's fence callback, which runs before each resend. If the fence refuses, the write is not resent and the refusal goes back to the caller.
   - `once` (drive-vault) and the runner's fenced writes pass their fence, so the person sees no new error.
   - A write to an existing file without a fence is not resent and fails as retry-kind.
3. **Creates by reserved id** keep their resend (write-once).
4. **Same class elsewhere:** the five sites in the note (`drive-http.ts:358, 367-381`, `runner/src/drive.ts:298-311`, `api/src/vault.ts:178`, `drive-vault.ts:326-348, 1066-1101`). Each either passes its fence or fails as retry-kind. No second retry path.

## Red (class test, from the note)

`a resent write to an existing file runs its fence first`: one table-driven unit test over every write port. It covers the `drive-http.test.ts` writes table, the runner's fenced writes and the Worker's `replaceText`.
- A fetch stub refuses the first write with each resendable answer (429, 403 rateLimitExceeded or userRateLimitExceeded, 401→refresh).
- It then changes the stored modifiedTime, name or parents.
- It expects the resend to be refused by the fence, and Drive to be unchanged.
- It fails today.

## Verify

The red; `creates by reserved id are still resent after a rate limit`; `pnpm check`; and the goldens C04 78 and 25-runs 88.

## Commits

The red (tests only), then the fix, then the notes in their own commit, with `tests changed:` lines and compatibility rows. The card carries `worktree:`. Every gate runs under `bash harness/with-lock.sh`.

Reviewers are read-only. They never move the main checkout.
