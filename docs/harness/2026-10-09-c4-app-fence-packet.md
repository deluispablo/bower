# Packet: c4-app-fence (stage 4, TL-P4-24, data safety, ahead of V2)

- **Entry:** `c4-app-fence` (escalated). Worktree `/private/tmp/bower-c4-fence`, branch `c4-app-fence` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-24 (main 8aa4205c), finding 2, option (a); runs after c4-undo-withdraw (both touch journal.ts);
  - the diagnosis [app-bin-skips-read-check](defects/2026-10-09-app-bin-skips-read-check.md), source of the class test;
  - the Codex review finding ([review](2026-10-09-codex-p3-review.md));
  - AGENTS hard rules: every content write passes the modifiedTime it read, a move or rename checks stillAsSeen, Bin only;
  - TL-P4-20 trial: the reviewer signs off the contract before implementation.
- **Review:** an escalated Claude reviewer plus one Codex read-only review pass (TL-P4-23 ruling 6).
- **Starting model:** `bower-escalated`.

## Contract

1. **`once` checks every send** (drive-vault), the Bin included. It reads the target and refuses when the target is not as seen.
2. **One helper.** The read-then-notAsSeen helper is written once, in `src/data/contracts/still-as-seen.ts`. `once` and `removeNow` both use it.
3. **Fold in the existing checks.** `stillAsSeen` and the hand checks at `drive-vault.ts:1078` and `:1708` fold into it, and so do the seven class sites in the note (`drive-vault.ts:703, 1089, 1078/1112, 1708, 453-466, 467`; `journal.ts:505`).
4. **No second fence.**

## Red (class test, from the note)

`every app write of an existing file refuses one that changed name or place elsewhere` (drive-vault.test.ts, FakeDrive). It is a table of app writes (trash, removePile, restore, journal Undo, move, rename, content write). Each target is changed in Drive first, and the test expects a refusal with Drive unchanged. A suite-wide check also verifies that each write of a file is preceded by a fresh read of it in the same call. It fails today for trash, removePile, restore and Undo.

## Verify

The red; `pnpm check`; the touched e2e on fake; the goldens. Any extra read must not raise the goldens; if it would, stop and report.

## Commits

The red (tests only), then the fix, then the notes in their own commit, with `tests changed:` lines and compatibility rows. The card carries `worktree:`. Every gate runs under `bash harness/with-lock.sh`.

Reviewers are read-only. They never move the main checkout.
