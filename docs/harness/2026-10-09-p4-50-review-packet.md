# Packet: P4-50 review (c4-app-fence, escalated, data safety)

This review is read-only and fresh.
- Run unit and contract tests only. Never start a server, run e2e or call the claude CLI.
- Never check out the main repo in any form.
- Run git with `-C /private/tmp/bower-c4-fence`.

## What to review

- **Diff:** `git diff 397ec1a56840ebbf41e637d4073352a590c3664f..c4-app-fence`.
  - Red 992f9458, fix c9c9bf11, notes 7dcdacf8.
- **Packet:** `docs/harness/2026-10-09-c4-app-fence-packet.md`, with its contract per TL-P4-24 addenda 2 and 4.
  - Defect `app-bin-skips-read-check`.
  - The Codex finding is in `docs/harness/2026-10-09-codex-p3-review.md` (finding 2).
- **Fixed questions (TL-P4-20):** contract first, then a second way.
  - Look for a second fence, a second still-as-seen predicate, or a second lost-answer path.
  - Give every finding a severity.

## Look hardest at

- **One helper.** `checkStillAsSeen(seen, read, message)` is in `contracts/still-as-seen.ts` and takes the reader, so contracts stays pure.
  - SeenFiles uses its two exported steps, `readForFence` and `refuseUnlessAsSeen`, rather than the helper itself. The notes say this keeps the FakeDrive fenced step synchronous. Is that one home or two?
  - The runner's behaviour and tests are unchanged.
- **Every app write of an existing file is fenced by a `byId` read in the same call,** with no reuse of a stale read (the drive-calls-cut lesson).
  - This covers the Bin, removePile, restore, Undo, unbin (which expects `trashed: true`), held.made and reservedFile.
  - The notes list 404/1030, 1708, 467 and 1544 as fenced but with no red row. Judge whether that is a gap.
- **The fence uses `byId`, never `get`.** `trashed` defaults to false. `notAsSeen` returns 'gone' when the Bin state differs from the expectation.
- **A read with no answer throws `notReadError`.** It never resolves, and never refuses as "changed".
- **Lost answer.** When the file already `holds` the write, the fence resolves as landed and nothing is sent again. The three lost-answer tests (drive-vault.test ~3081, ~3099, ~535) stay green.
- **The check at `:1078` gains name and place.** It is one predicate, the same one the runner's content writes use.
- **The golden at `drive-vault.test.ts:2855` was NOT updated.** The notes say a Home load sends no write. Check that this is true, and that the pile edit's extra `byId` per send raises no golden.
  - Runner goldens: C04 78 and 25-runs 88 must not rise.
- **Errors are never swallowed.** The refusal sentence is unchanged.
- **No real timers.** The `tests changed:` lines are present. There is no `.only` or `.skip`.

## Reply

Use the review card from `docs/harness/WORKER.md` (PASS or BLOCK), with every line under 120 characters. Put the details in `/private/tmp/p4-50-review-notes.md`.
