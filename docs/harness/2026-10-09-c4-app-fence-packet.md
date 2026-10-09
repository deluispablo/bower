# Packet: c4-app-fence (stage 4, TL-P4-24, data safety, ahead of V2)

- **Entry:** `c4-app-fence` (escalated). Worktree `/private/tmp/bower-c4-fence`, branch `c4-app-fence` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-24 (main 8aa4205c), finding 2, option (a); runs first, in parallel with c4-test-timers (TL-P4-24 addendum 2); c4-retry-fence and c4-undo-withdraw build on its helper;
  - the diagnosis [app-bin-skips-read-check](defects/2026-10-09-app-bin-skips-read-check.md), source of the class test;
  - the Codex review finding ([review](2026-10-09-codex-p3-review.md));
  - AGENTS hard rules: every content write passes the modifiedTime it read, a move or rename checks stillAsSeen, Bin only;
  - TL-P4-20 trial: the reviewer signs off the contract before implementation.
- **Review:** an escalated Claude reviewer plus one Codex read-only review pass (TL-P4-23 ruling 6).
- **Starting model:** `bower-escalated`.

## Contract (TL-P4-24 addenda 2 and 4, main 1e7fb4dc)

1. **One helper.** `checkStillAsSeen(seen, read, message)` lives in `src/data/contracts/still-as-seen.ts`. It takes the reader, so contracts stays pure. Callers:
   - `SeenFiles.assert` and `read` (`seen-files.ts:65-90`) keep their map and folder case, but call it. Runner behaviour and runner tests stay the same.
   - DriveVault `once` and the Journal (removeNow) call it.
   - Its shape serves c4-retry-fence as a `() => Promise<void>` closure (no refresh inside) and c4-undo-withdraw's Bin.
2. **`SeenExpectation` gains an optional `trashed`** (default false). `notAsSeen` returns 'gone' when the file is missing or its trashed state differs. Unbin expects `trashed: true`. Fence reads use `byId`, never `get`: `get` throws not-found and forces `trashed:false` (`drive-vault.ts:1722`).
3. **A read with no answer** throws `notReadError`.
4. **Lost answer.** If the file already `holds` the write, the fence resolves as landed and nothing is sent again. The three lost-answer tests (drive-vault.test ~3081, ~3099, ~535) stay green.
5. **`once` checks every send,** the Bin included. `stillAsSeen` and the hand checks at `drive-vault.ts:1078` and `:1708` fold into the helper, and so do the seven class sites: `703, 1089, 1078/1112, 1708, 453-466, 467`, `404/1030`, and `journal.ts:505`.
   - The check at `:1078` gains name and place: one predicate, the same one the runner's content writes use.
6. **No second fence.** The Bin's extra `get` is accepted. The app golden (`drive-vault.test.ts:2855`) is updated, with a `tests changed:` line.

## Red and verify (exact names)

- `every app write of an existing file refuses one that changed name or place elsewhere` (`src/data/vault/drive-vault.test.ts`, FakeDrive).
  - It is a table with one row per class site above.
  - In each row, the target is changed in Drive first: renamed, moved, edited, binned or unbinned. The write must be refused and Drive left unchanged.
  - It fails today for trash, removePile, restore and Undo.
- `every app write of a file reads it fresh in the same call`: a spy proves a `byId` of that id after the last mutation, inside the same call.
- `a fence read with no answer refuses with notReadError`
- `a lost answer whose file already holds the write resolves without a resend`
- `unbin expects the file in the Bin`
- Runner: `SeenFiles` tests are unchanged and green.
- Goldens: the app golden at `drive-vault.test.ts:2855` (updated for the Bin's `get`); C04 78 and 25-runs 88 (`runner/test/drive-calls-golden.test.ts:21,69`) must not rise.
- e2e on fake, phone and desktop: qa9 and qa10 (Bin and Undo), capabilities.
- `pnpm check`.

## Commits

The red (tests only), then the fix, then the notes in their own commit, with `tests changed:` lines and compatibility rows. The card carries `worktree:`. Every gate runs under `bash harness/with-lock.sh`.

Reviewers are read-only. They never move the main checkout.

## Contract review pass 1 (2026-10-09)

# c4-app-fence contract sign-off (claude/p3 e1f5bbe1, read-only)

Verdict: CHANGES. Nine points. 1-6 block signing; 7-9 are sharpenings.

1. Lost-answer retry (no point states it). Contract 1 says "refuses when the target is not as seen". A second press after a
   lost answer finds the file already binned/moved/written: pre-send notAsSeen gives 'gone' (still-as-seen.ts:47, trashed)
   or 'modified'. Diagnosis option (a) has "if holds(f, intent, now), resolve as the person's own landed write" (holds,
   write-once.ts:~92); the packet dropped it. Needs a contract line and a named verify: existing tests drive-vault.test.ts
   "a Bin whose answer was lost is resolved by its stamp" (~3081), "a restore whose answer was lost..." (~3099),
   "a retry after my own unknown write is not called a change elsewhere" (~535) must stay green.
2. Unbin has no expectation. notAsSeen returns 'gone' whenever now.trashed (still-as-seen.ts:47) and `SeenExpectation`
   has no trashed field. fromBin/restore (drive-vault.ts:453,465,466, 1748) act on a trashed file, so the helper must take
   "expects trashed" and read with { binned: true } (byId, write-once.ts:63; fake-drive.ts:158 hides the Bin otherwise).
   Contract 1 says "the Bin included" but not the Bin's own read, or the unbin direction.
3. How a gone file reads. Current stillAsSeen (drive-vault.ts:1722-1726) uses drive.get (throws not-found, not null) and
   forces trashed:false, so "gone" never reaches notAsSeenReason. The red expects reason in parents/name/gone. Contract
   must say: read by byId (null when gone), pass the real trashed, map to a 'gone' refusal.
4. A read that gets no answer. Nothing says what a failed fence read does. The one home already has it:
   notReadError/notRead (still-as-seen.ts:67-78) and SeenFiles.read (seen-files.ts:~85). State: nothing sent, thrown as
   not-read, not as a refusal. Add a red row (get offline before Bin: Drive unchanged, not "changed somewhere else").
5. Second home risk. seen-files.ts:65-80 (SeenFiles.assert + read) already is "read then notAsSeen" for the runner. A new
   app helper in contracts/ is a third copy unless SeenFiles uses it or the contract says why not. Also contracts/ is
   pure (no I/O); the helper must take the reader as a parameter (Gets) so dependency-cruiser stays green. Say so.
6. Red does not cover all seven sites. The table lists trash, removePile, restore, Undo, move, rename, content write.
   Not in the table: declaration copies 703/1089 (can be reached via removePile of a declared pile and via updatePile
   lone->folder), updatePile note Bin 1112, reservedFile 1708/held.made 404/1030, restore's rename 467, late 1544, content
   write at 493/1138. The suite-wide spy is the only cover and is under-specified: "preceded by a fresh read in the same
   call" passes on a stale earlier read (the listing). Define: a get of that id after the last mutation of any file and
   before the write, within the one write call; and say the spy fails today for 703, 1089, 1112, 1708-callers, 467 too.
   Give the spy a name as its own test (verify then names two tests).
7. "Folds the hand check at 1078" changes behaviour: 1078 compares modifiedTime only; folding onto notAsSeen adds name
   and place for the pile note. Also 1740 already adds seenPlace for text. State it is intended (and that a text change
   elsewhere still does not clash with a move: AGENTS) and cover with a row (note renamed elsewhere, then pile edit).
8. Verify "goldens ... must not raise". Unnamed. The only app golden is "Home Drive calls match the golden"
   (drive-vault.test.ts:2855), a Home load with no writes, so it cannot move. Runner goldens (C04 78, 25-runs 88) never
   touch DriveVault/Journal. Diagnosis accepts +1 get per Bin (+copies). Reword: name the golden, and state that a Bin's
   extra get is expected, or name a call-count test for a Bin. Also "the touched e2e on fake" has no names; name them.
9. Stale ordering. Packet sweep line says "runs after c4-undo-withdraw (both touch journal.ts)"; the entry now runs first,
   and retry-fence and undo-withdraw build on it. Update; and drop the "fails today for trash, removePile, restore and
   Undo" to match point 6.

Red would fail today, for the stated reason, on trash, pile trash, removePile (diagnosis reproduced: resolved,
trashed:true, inProjects:true), restore and journal Undo. Move/rename/content-write rows pass today (controls): label
them so in the test, or the card's red line cannot say which row failed.

Helper shape for the later entries:
- retry-fence needs `fence: () => Promise<void>` (packet: drive-http fence option, re-run before each resend, throwing the
  caller's own not-as-seen error). Make the helper return exactly such a closure or be trivially wrapped:
  (reader, seen, { trashed?, binned?, message, code }) -> () => Promise<void>, idempotent and callable many times, no
  side effects except the thrown error. App `once` and Journal pass it as-is; no second fence.
- It must include the holds shortcut (point 1) as an input (`landed?: (now) => boolean`) since the resend after a lost
  answer must also land, else `a passing fence still lands the resend` fails for Bin/text.
- undo-withdraw's Undo of a Bin/restore needs the trashed expectation (point 2).
- The refusal sentence stays 'This changed somewhere else. Look again and try once more.' with `void this.refresh()`
  on refusal (drive-vault.ts:1725); the helper must not call refresh itself (Journal has no vault).
