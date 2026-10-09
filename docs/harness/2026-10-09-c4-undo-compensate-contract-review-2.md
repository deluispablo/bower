# c4-undo-compensate contract sign-off, pass 2: CHANGES

Read at claude/p3 (packet 1e46b9b7, DECISIONS addendum 2, pass 1, the 12 Codex findings, the code below).
Paths are under /Users/deluisp/Projects/bower-app/src/data. I = Important (blocks), M = Minor.
Second way: not by intent. Findings 1 and 2 are where one would appear.

## Findings

1. I. The rule inverse does not work in the common (online) case, so "the inverse applies whenever it arrives" is false for rules.
   - Online, `record()` sends at once (vault/journal.ts:270), so an added or kept rule's line is already sent when Undo runs.
     Undo then records `Removed the rule X` beside the unarchived `New rule: X` (inverse of :1402, :1316).
   - Both lines go into one run. `ruleChangesOf` (spine/scripted.ts:1985-1999) puts them in one `rules-wording` change.
     `wordRules` applies all removals first (contracts/note-edit.ts:623-626 `[...removed].reduce(removeRule, text)`), then the adds
     (:628-634). The removal finds nothing, the add lands, and X is in Rules.md after the person pressed Undo.
   - The app's view repeats it: `rules()` filters only the worded rules by `removed` (vault/drive-vault.ts:1291-1296).
     The pending `New rule: X` line stays in the list.
   - Fixing it needs add/remove order by line (the runner contract) and a `rules()` filter: the "fold" addendum 2 excluded.
     The lead must rule: change `wordRules` to take line order, or limit rule Undo to the drop case.
     Red through the vault API: addRule or keep a suggestion online, Undo, tidy-up, assert Rules.md lacks X.
     It fails on any build that only records the inverse.
   - Move then move back in one run goes through `formerNames` chains (contracts/links.ts:10). Name a test that the round trip
     leaves links as they were.

2. I. "Since the last tidy-up" hides the pair, but no field links the inverse to its original.
   - `JournalExtra` (contracts/journal-record.ts:4-15) has no such key, and addendum 2 says "no new line kind".
   - Without a key the pair is inferred from content: rule text, `from`/`path`/`fileId` of a move, a `trash` and a move "back
     from the Bin". That is a match by name (WORKER checklist: match by id) and a second reconciliation.
   - Name it: an optional `undoes: <id>` on the inverse line, strict on write and lenient on read, with a fixture beside
     `fixtures/p2/journal-*`. Or rule that the pair is inferred and name the rule per kind.
   - The shape of the restore line is also open. A move needs `from` and `path` (drive-vault.ts:331-333). What do they hold for a
     move out of the Bin, and what does a run do with it? (`renamesFor` only follows paths, contracts/note-edit.ts:149.)
   - The hiding is in `changes()` (vault/drive-vault.ts:553) and every source: the demo and fake vaults, and
     contract/vault-contract.ts:237 ("undo of a move removes its entry"), change meaning. Name the files.

3. I. The replacement for `Journal.remove` and its call sites is not named.
   - `remove` is deleted for sent lines, but it has seven callers: drive-vault.ts:331, :350, :434, :469, :1313, :1322, :1402.
     The packet lists five and misses :1313 (removing a pending rule is a forward act, not an Undo), :350 and :434.
   - Name the one new Journal method. Suggested: `retract(id)` returns `dropped | sent`, decided under the lock; the caller
     records the inverse when `sent`.
   - Say what a failed `keep` does there: today it throws "keep this page open" (journal.ts:498-501).
   - journal.test.ts uses `remove` at :48, :258, :637, :648. Those tests need `tests changed:` lines.

4. I. The offline Bin copy promises a retry that no contract item builds.
   - "<name> comes back when you are online" says it will come back by itself. `restore` is a direct Drive write
     (`fromBin`, drive-vault.ts:1775, through `once`). Offline it throws. Nothing keeps and resends it; `Journal` only holds lines.
   - The string exists nowhere in p3 or on the parked branch.
   - Either name the mechanism (the Bin entry kept and retried when back online, with its home and a test), or change the row
     to the existing offline sentence. As written the copy promises what is not built. "While the file is still in the Drive Bin"
     is not defined either.

5. I. The per-folder FIFO needs rules the packet does not give, and they change visible behaviour.
   - `sendWaiting` keeps sending past a `later` or `{waits}` line (journal.ts:371-376).
   - `record()` sends its own line after `sendWaiting` whatever still waits (:253-270), and so does the kept retry.
   - To build it: stop the loop at the first line not `sent` or `refused`, and keep the new line in the outbox (answering as
     `later`, :296) while an earlier one waits.
   - A head waiting on the person (`waits`, sign-in or permission, :415) then blocks every later line and every inverse until they
     act. Say so, and say what `record()` answers for a line behind it (it only throws for its own wait, :298).
   - The failed list is fed only by `sendWaiting` (:382-387). A refusal inside `record()` throws and drops (:275-281) and is not
     listed. Say that is intended, and that the inverse of a refused original is sent alone (a lone inverse in the report).

6. I. The lock-before-send scope is wider than the race and not buildable as written.
   - A line not in the outbox (the fast path, :250-270) cannot be dropped by another tab. A lock plus `reserveFor`
     (journal.ts:355) before every send removes the stated "no lock to take" (:250) and adds a network round trip to every change.
     The race is only for lines already in the outbox: the kept retry (:259-269) and the bare lines of `sendWaiting` (:352-367, already under the lock).
   - `acrossTabs` is not re-entrant (:338-343) and `sendWaiting` calls `send` inside it. A locked `send` needs a split
     (`send` plus a locked wrapper) or it deadlocks.
   - Undo takes the same lock, so it waits for a whole network loop of `sendWaiting`. Say that is accepted.
   - Name the scope: the kept retry only, plus Undo.

7. I. The reds do not say what they assert, and one does not go through the named API.
   - Addenda 13-14 #4 (two tabs Undo the same change) can end as one inverse or two harmless `Removed` lines. State the
     assertion; a worker may not loosen it.
   - Round 1 #2 is `removePile`/Sending (the kept write-once withdraw), not `removeRule`, `restore` or `undo`. Name `removePile`.
   - Addenda 14 #3 (create landed, then a permanent refusal) has no direct form. State its translation: the refused original is on
     the failed list, the later Undo records an inverse, and the inverse is refused with its kind's sentence.
   - Round 1 #1 does fail on p3: `removeNow` runs outside the lock (journal.ts:495-516). The test needs two vaults sharing one
     outbox and the Web Locks stub.

8. M. The n/a list is honest, with two caveats; and some pass-1 findings still apply.
   - Honest: round 2 #1-3, round 3 #1-2, addenda 13-14 #1, #2, #5. Their structures (sent-lines, `confirmed`, `archivedByRun`,
     listing decisions) no longer exist.
   - Caveat A: round 1 #2 is not n/a (finding 7). Caveat B: addenda 13-14 #4 has a Bin form, two tabs `restore` the same file;
     the fence makes the second fail with "no longer in the Bin". Say that sentence is accepted.
   - Pass-1 still applying (minor): 7 (no file-scope list: journal.ts, drive-vault.ts, contracts/journal-record.ts, Home.tsx,
     demo/fake vaults, vault-contract.ts, journal.test.ts); 11 (finding 6); 14 (finding 3); 15 (say whether `undoToast`'s
     "Not undone yet" branch and `ErrorCode 'unreached'` stay for removePile, and drop write-once `Keeps`/`hold` if `archivedByRun`
     goes, or knip flags them). Pass-1 1-6, 8-10, 13, 16-17, 19-25 targeted the removed fold and are closed.
   - The model property's third assertion is the decision itself. Add an independent end-state oracle (replay the Drive journal
     in `at` order), and cover reserve failing offline and a `waits` head.

## Checks, in one line each

- Inverses named with refs: yes for :1402/:1316, :1322, :438, :331; missing :1313, :350, :434 (3); rules fail in one run (1).
- "Under the lock: unreserved drops, else inverse": buildable; `reserved` is the right marker (journal.ts:352-367). Narrow the lock (6).
- FIFO, kept retry, failed list: buildable with the rules in 5.
- Pair hiding without a second fold: not as written (2).
- Reds can fail: round 1 #1 yes; #2, #3, #4 need assertions (7).
- Second way: no by intent; risk through 1 and 2.

Findings: 8 (7 Important, 1 Minor).

Verdict: CHANGES
