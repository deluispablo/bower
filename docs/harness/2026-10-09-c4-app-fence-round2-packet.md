# Packet: c4-app-fence fix round (TL-P4-24 addendum 6, main 8cf7df6a)

- **Entry:** `c4-app-fence`, escalated, on the same Opus rung. Worktree `/private/tmp/bower-c4-fence`, branch `c4-app-fence` (at 7dcdacf8). Merge `claude/p3` first.
- **Ruling sweep:**
  - TL-P4-24 addenda 4 and 6;
  - the Codex review `docs/harness/2026-10-09-codex-c4-app-fence-review.md` (3 Important);
  - the P4-50 card's minors.
- **Why:** addendum 4 point (1) says a landed write resolves and is never refused. Three retries are refused before `once` sees the stamped write.

## Contract

1. **The landed check lives in the one helper.** `checkStillAsSeen(seen, read, message, { landed })` takes an optional `landed(now)` predicate. The helper evaluates it before `notAsSeen`; when it holds, the fence resolves as landed and nothing is sent again.
2. **Every app fence passes its intent's write-once landed test:**
   - for a rename: the target name and place, plus its stamp;
   - for a text write: `holds`, including empty text. The truthy test at `:1078` goes.
3. **No precheck may refuse first.** `:1747` (the restore rename) and `:1066` (the updatePile folder rename) go through the helper.
4. **Minors folded in as contract gaps:**
   - `journal.ts:509` uses `CHANGED_ELSEWHERE`, not a copied literal;
   - SeenFiles calls `checkStillAsSeen` itself, not its two exported steps. If FakeDrive's synchronous step makes that impossible, stop and say why on the card. Do not keep two entry points silently.

## Red (one per finding, plus the gaps)

- `a restore whose rename landed but lost its answer resolves on the second press` (Codex 1, `:1747`).
- `an updatePile folder rename that landed but lost its answer lets the retry finish` (Codex 2, `:1066`).
- `clearing a pile's words that landed but lost its answer resolves on retry`. It covers both the declared pile's empty write and the ordinary pile's Bin (Codex 3, `:1078`).
- The table `every app write of an existing file refuses one that changed name or place elsewhere` gains rows for `:1030` (404), `:1708`, `:467` and `:1544`.
- `an Undo whose Bin landed but lost its answer resolves without a resend` (journal).
- Each red must fail before the fix (say which cells pass today, if any).

## Verify

- The reds, plus every verify from round 1.
- e2e qa9, qa10 and capabilities on fake, phone and desktop.
- `pnpm check`, run through `bash harness/with-lock.sh`.
- The goldens do not rise.

## Commits

1. The red (tests only).
2. The fix.
3. A notes addendum (a "Fix round (addendum 6)" section) and compatibility rows, with `tests changed:` lines.

Then the delta goes to a Claude re-review and a Codex pass on the delta.
