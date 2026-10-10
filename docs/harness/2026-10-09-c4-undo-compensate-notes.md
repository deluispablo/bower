# c4-undo-compensate notes

Entry `c4-undo-compensate` (TL-P4-27 addenda 2 to 5). Worktree `/private/tmp/bower-c4-compensate`.

## Commits

- `1d70a38f` kept files from c4-undo-withdraw (70a2b0da) by path, never cherry-picked.
- `8d714c20` red (mine). `9c68e81c` red, the Codex model property (cherry-pick of 5edef77f, unchanged).
- `1b82b559` fix. This file and the compatibility rows: the notes commit.
- Merges of claude/p3: `727a363a`, `4ecea118` (c4-lockf; lock at /tmp/bower-heavy.lockf).

## Kept from the parked branch, by path

- `src/ui/toast.tsx`, `src/ui/toast.test.ts`: toast `replace` and `press`.
- `src/ui/report.ts`: `undoToast` (then given the offline branch in the fix).
- `src/features/piles/PileScreen.tsx`, `piles.module.css`: the removePile box and "Not removed yet" copy.
- `src/features/files/file-actions.ts`, `src/features/bower/BowerScreen.tsx`, `src/features/home/Home.tsx`: their Undos through undoToast.
- `src/data/spine/write-once.ts`: `withdraw`, `alone`, `Intended.withdraw`; `src/data/vault/drive-vault.ts`: `withdrawPile` (Sending, uploads, removePile).
- `src/data/contracts/types.ts` (ErrorCode `unreached`), `src/data/drive/drive-api.ts` (`DRIVE_MESSAGES.unreached`),
  `src/data/worker/worker-http.ts` (its sentence row), `src/data/choose.ts` and `src/data/demo/scenario.ts` (`withdraw-unreached`).
- Tests: `src/data/spine/write-once.test.ts` without the journal-keeper and confirmed-line describes;
  `src/data/vault/drive-vault.test.ts` only the upload withdraw `it.each`.
- Left on the parked branch: `confirmed`, `arrived`, `archivedByRun`, `listedNow`, `outboxWaits`, `bower:sent-lines`,
  the journal "Not undone yet" path, `live/index.ts`, `session.test.ts`, `live.test.ts`, `bfcache`/`qa27` e2e edits.
- write-once `Keeps` and `hold`: knip (check-unused-gate) does not flag them, so they stay (`withdrawPile` uses `Keeps`).

## Design as built

- `Journal.retract(id): Promise<'dropped' | 'sent'>` under serial + the outbox lock. Dropped: in the outbox with no
  reserved id, or on the failed list. Else 'sent'. A failed keep throws "Bower could not take that change back; keep
  this page open." `Journal.remove` is deleted.
- Seven callers: move Undo (:331) inverse with `undoes`; rename (:350) combined line on 'dropped', rename line else;
  trash (:434) nothing on 'dropped', trash line else; restore (:469) a `move` line `Put back <name>` with `path` and
  `from` both where it came back, `fileId`, `undoes`; removeRule pending (:1313) "Removed the rule" with `undoes` of the
  add on 'sent'; removeRule's Undo (:1322) "New rule" with `text` = the worded text and `undoes`; dismissSuggestion's
  Undo (:1402) "Removed the rule" with `undoes`. The folding sites log a failed retract and record their forward line.
- Choice beyond the letter: :1313 carries `undoes` (taking a pending rule out is its inverse), so "removing a waiting
  rule leaves no line in your changes" still holds, and the Codex property expects exactly that.
- FIFO: `sendWaiting` stops at the first line neither sent nor refused and returns each outcome; `record()` keeps its
  line behind a waiting one (`later`); the kept retry is sent inside `sendWaiting` under the lock. An inverse awaits its
  original's fast-path send (`flying`, per page).
- `pairsOf(lines): Set<string>` in contracts/journal-record.ts: ids of every line whose `undoes` is in the set, and
  that line. Used by `changes()` and the planner's report plan (a pair gives `yourChanges: 0`, no rulesWorded).
- `ruleSequence` in contracts/note-edit.ts: the one home for rule order, used by `wordRules`, the planner's `wordedBy`
  and `rules()`. A missing Rules.md keeps the removals in the sequence.
- `renamesFor` drops a rename to the name a note has again (move and move back).
- Restore with no answer from Drive (the write or its fence read) is raised as `offline`; undoToast then says
  "Not undone yet: Bower could not reach Drive. Try again when you are back online." with Try again.
- Mechanism map row added in docs/ARCHITECTURE.md.

## Reds and their findings

- round 1 #1: `undo-compensate.test.ts` "the removal undone while another page reserves its id …" (red: timeout at p3).
- round 1 #2: the kept test in `spine/write-once.test.ts` "a pile removed while its link create is in flight never
  leaves a live file" (red at claude/p3 on the parked branch; already green from commit 1).
- addenda 13-14 #3: "drops the refused line and records nothing" (guard: passes at p3, which did nothing either).
- addenda 13-14 #4: move form and Bin form (guards; the Bin form accepts "no longer in the Bin").
- rules: "a suggestion kept as a rule online, then Undo", "a rule added online, then taken out" (red at p3: nothing to
  read), "an Undo of a rule removal that a tidy-up already took …" (red: changed somewhere else).
- pairs: "pairsOf hides a pair in Since the last tidy-up", "a same-run pair gives no report row and a count of 0",
  "a same-run rule pair …" (red); "a later inverse gives one ordinary row" (red at p3: the tidy-up refused).
- FIFO: "a change made while an earlier line waits stays behind it" (red).
- note-edit: line-order add then removal (red), removal then add again (guard), old manifest fixture (guard), move and
  move back rename no link (red). journal-record: old-reader fixture (guard), non-string `undoes` refused (red).
- ui: `undo-toast.test.ts` offline Undo (red).
- n/a by construction: round 2 #1-3, round 3 #1-2, addenda 13-14 #1, #2, #5: their structures (sent-lines,
  `confirmed`, `archivedByRun`, listing decisions) do not exist; an Undo never reads or bins a Drive journal file.

## Codex model property (TL-P4-28 ruling 2): fails, for the lead

- Seed 427285, path "4": the oracle expects rule "Keep category 22" present, Drive has its inverse removal.
- Cause: the Undo's inverse `record()` met a `permission` wait, so record kept the line and threw its existing wait
  sentence ("… will send it later"). The property counts a thrown Undo as unresolved; the kept line is then sent at
  the final flush, as addendum 4 (5) says a `waits` line is ("blocks … until the person acts").
- Check: a local copy that marks such an Undo resolved when its message says the line is kept passes 30 runs at the
  seed and 150 random runs. No other failure class seen. The property file is unchanged; the lead rules.

## Tests changed

tests changed: src/data/vault/journal.test.ts: "remove puts only that file in the Bin" became two retract tests (sent stays, unsent drops); `remove` is deleted (addendum 4 (3)).
tests changed: src/data/vault/journal.test.ts: "taking a change back whose Bin answer was lost …" deleted: the client never bins a journal line now.
tests changed: src/data/vault/journal.test.ts: the c4-retry-fence describe (journal Undo after a 429, two tests) deleted: same reason.
tests changed: src/data/vault/journal.test.ts: full Drive test: a rule recorded behind a waiting line now resolves as later (FIFO, addendum 4 (5)) instead of throwing the full-Drive sentence.
tests changed: src/data/vault/drive-vault.test.ts: app-fence row "journal Undo of a change whose line moved elsewhere" deleted (no journal Bin).
tests changed: src/data/vault/drive-vault.test.ts: "an Undo whose Bin landed but lost its answer …" and "a restore retried after an outside Bin …" deleted: their trigger was the journal line's Bin.
tests changed: src/data/vault/drive-vault.test.ts: answer-lost property loses kind 'undo' (journal Bin), met 132 -> 120 (12 cases of that kind).
tests changed: src/data/vault/drive-vault.test.ts: "a restore whose journal PATCH gets a 429 still finishes" deleted: a restore sends no journal PATCH.
tests changed: src/data/vault/drive-vault.test.ts: added the kept upload withdraw it.each from the parked branch.
tests changed: src/data/contract/vault-contract.ts: "undo of a move removes its entry" renamed "undo of a move or a Bin shows no entry for either" (pairs hidden, not removed).
tests changed: src/data/contract/vault-contract.ts: "one line for a new thing named straight away" (name kept, "or its making and then its rename once sent" added) and "made and binned straight away leaves no trace" accept the kept history when the making was already sent (create then rename / create then trash).
tests changed: src/data/live/live.test.ts: after restore the outbox is empty and the rule line arrived once: the inverse line sends the waiting line first, in order.
tests changed: src/data/spine/write-once.test.ts: kept from the parked branch without its journal-keeper and confirmed-line describes.
tests changed: src/ui/toast.test.ts: kept from the parked branch (toast replace and press).
tests changed: src/data/contracts/note-edit.test.ts: my own red "an add and its later removal" asserted ok with one rule; applyChanges answers `unchanged` for an edit that writes nothing, so it asserts that refusal (Rules.md untouched); not looser.
tests changed: src/data/vault/undo-compensate.test.ts: my own red: typing of the generateIds stub only; round 1 #2 moved to the kept write-once test.
tests changed: src/ui/undo-toast.test.ts: my own red: typing of the mock only.

## Gates

- Unit: all green except the Codex property (above). Runner tests green: drive-calls golden 78 and 25-runs 88 unchanged.
- e2e fake, phone and desktop, with axe: c4-undo-compensate, v2-dock, qa8, qa5, journal-failed, bfcache, qa27, app,
  capabilities, qa26, home-errors: 140 passed, 26 skipped (/tmp/compensate-e2e-touched.log).
- Seen with the pretend Drive only: a `page.goto` right after an Undo can reload before the pretend Drive's debounced
  save, so the e2e goes Home through the app's own link.

## Sources

- Event sourcing, compensating actions: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
- Web Locks API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- fast-check model-based testing: https://fast-check.dev/docs/advanced/model-based-testing/

## For the coordinator

- check-harness: features.json entry `c2-create-by-id` names "taking a change back whose Bin answer was lost is resolved
  by its stamp", deleted here (no journal Bin). Workers do not edit features.json: its verify needs the coordinator.

## Merge with claude/p3 (c4-create-landed round 1)

Resolved the four conflicted files in the existing merge; no Git write command was run. The coordinator stages and
commits the result. This resolution reuses the existing mechanisms and the sources cited above; no network was used.

- `src/data/spine/write-once.ts`: merged the imports for both the landed checks and the withdrawal fence.
  `makeOnce(h, w, fresh, create)` keeps the first `Sent` on `Holder.sent`, resends it, releases it with a permanently
  refused id, and clears only the intent on a retryable 404, as round 1 requires. All of that remains inside `alone`,
  so creates and withdrawals on the same holder still serialize. `Intended.make` takes the new signature while
  `Intended.withdraw` stays. Successful withdrawal clears both the id and its intent; refused or held withdrawal
  keeps both. The existing landed/intent helpers remain their only home.
- `src/data/spine/write-once.test.ts`: merged both import lists and retained both complete describes: the withdrawal
  keeper/outcome matrix (including removePile while Sending) and the first-intent retry/404 regression. Their
  assertions are unchanged; only the shared closing braces were separated so neither suite nests in the other.
- `src/data/vault/drive-vault.ts`: combined the active landed/intent and withdrawal imports, removing imports whose
  uses the landed changes replaced. Kept the round 1 create signatures for Intended and Sending, alongside ours'
  removal-waits-for-create behavior. A removed Sending link/empty thing returns after withdrawal settled it, so it
  is not binned twice. Undo still uses retract and records inverse forward lines with undoes; no journal Bin or
  journal remove caller is restored.
- `src/data/vault/journal.ts`: kept retract, the FIFO outcome map/break, and record's original-in-flight wait and
  single-send decision. Removed the conflicting extra unconditional send, which would bypass that decision.
  Both the fast-path send and the locked sendWaiting loop pass the folder's outbox key to the intent-aware send.
  `makeOnce` stores the intent, and keepHeld persists the id and intent before an outbox send and after failure.
  The old-keeper parser remains lenient. Kept retries still go through the already locked sendWaiting loop;
  the fast path remains unlocked, with an inverse waiting for its original's in-flight send. No re-entrant lock
  or second outbox mechanism was introduced. Imports and file bookkeeping used only by the deleted journal Bin
  path stay deleted. Replacement inverse lines use the same intent-aware record/send path as other lines.

Both contracts therefore use one write-once home for create recovery and intended landing, and one journal home
for outbox storage, retract and per-folder order. The automatically merged keeper and landed regressions remain,
including the refresh/retry red, old-entry fixtures and the compensating-Undo reds. No test or red was weakened.

tests changed: src/data/spine/write-once.test.ts: combined imports and separate describe closures; both suites and assertions kept.

Verification:
- `pnpm exec tsc -p tsconfig.app.json`: PASS; `/tmp/compensate-merge-tsc.log`.
- `pnpm exec vitest run src/data`: 72 files passed, 1 failed; 3,793 tests passed, 1 failed;
  `/tmp/compensate-merge-unit.log`. The sole failure is the expected Codex property, seed 427285, path "4":
  the oracle counts the kept inverse as unresolved and expects "Keep category 22 together" to remain.
- `src/data/vault/undo-compensate.property.test.ts` is unchanged. No other failure occurred.
- No conflict markers remain in src/data, and `git diff --check` passes.
- No pnpm check or e2e was run, as instructed for this merge.

Reference check: the supplied DECISIONS.md and HEAD version contain TL-P4-27 addenda 4 and 5, but no addendum 6.
The lock scope used here is the explicit Addenda 4 and 5 packet contract and the matching addendum 4 (6) ruling.

## Property amended (TL-P4-27 addendum 6)

tests changed: src/data/vault/undo-compensate.property.test.ts: a kept inverse (thrown with the waits sentence, line still in the outbox) is pending and resolved by the flush; only a refusal with nothing kept is unresolved, classified by the outbox and failed list after the call; adds: the sentence promises "later" exactly when kept; seed 427285 x30 plus 300 random runs; oracle unchanged (TL-P4-27 addendum 6, amended by a fresh Codex session).
tests changed: src/data/vault/undo-compensate.property.test.ts: the model tracks each kept inverse until it is sent or refused; a later refusal leaves the original in force and the inverse must show on the failed list (journal.ts:421); report and recovery expectations use the tracked outcome; seeds, counts and oracle unchanged (TL-P4-27 addendum 7, Codex property session).

## Round 2 (addendum 8)

Implementation session for the four independent reds in `0e6fde89`; no network or Git write command used.
The standard mechanisms remain the existing Web Locks outbox and compensating forward lines, using the
Microsoft compensating-transaction and MDN Web Locks sources already cited above.

- `src/data/vault/journal.ts:213`: storage wins over page memory for every stored line. A failed keep retains
  only page-only lines, so a failed reservation cannot leave a stale shadow that resurrects another tab's retract.
  `:392` sends nothing when keeping fails and marks every waiting line `later`; required flush still throws the
  existing offline sentence. `:426` rereads each send's holder from storage under the existing lock.
  `:469` checks keeping the first intent before create; `:496` returns the existing keep operation's success.
  FIFO, reservation, intent recovery and retraction remain in their existing homes.
- `src/data/vault/drive-vault.ts:1359`: kept-rule Undo resolves the add line's text to the stored wording through
  `ruleSequence`; `:1442` passes the add line's text, never the suggestion title. The inverse stores and says
  the resolved rule wording. This also uses the rule's own words when a tidy-up has already archived its add.
- `src/data/contracts/note-edit.ts:637`: the shared sequence sorts modern changes by since then recordId,
  matching journal order at equal timestamps without sorting by class. Both wordRules and rules() use it.
  `:643` resolves removals through the existing ruleLike identity inside this one sequence, including the
  worded rule's You wrote text. Old manifests with a removal lacking since retain removals-first ordering.
- `src/data/spine/scripted.ts:1845`: an unpaired rule inverse has its own ordinary updated row and one change
  counted, dependent on its rule effects and archive. Same-run pairs still hide both rows and count neither.
  Report construction and pairsOf remain the existing presentation homes.

tests changed: none
compatibility: c9811c7e

Verification (output redirected; failure blocks and summary counts only inspected):
- Red baseline: all four new scenarios failed; `/tmp/compensate-r2-red.log`.
- `pnpm exec tsc -p tsconfig.app.json`: PASS; `/tmp/compensate-r2-tsc.log`.
- `pnpm exec vitest run src/data`: PASS, 73 files / 3,804 tests; `/tmp/compensate-r2-unit.log`.
  All four round-2 reds, every existing data test and the unchanged property's seeded and random batches pass.
- `pnpm -C runner exec vitest run`: PASS, 40 files / 314 tests; `/tmp/compensate-r2-runner.log`.
  Unchanged `runner/test/drive-calls-golden.test.ts` asserts C04 exactly 78 and 25-runs exactly 88.
- `git diff --check`: PASS. No test file is modified. No pnpm check or e2e run.

The coordinator commits the four production files as the fix, substitutes its SHA for c9811c7e, then commits
this notes file separately. No out-of-scope mechanism or second implementation path was added.

## Re-plan (addendum 9)

Implementation of TL-P4-27 addenda 9 and 10; the separate red owner supplied `8da56079`.
The checkout's current baseline is `d4d4dc06` (merge of claude/p3), not just the red commit.
No network, Git write command, test edit, pnpm check or e2e was used. The coordinator owns the fix commit
and the separate notes commit. Status: blocked on the existing app-create property below; do not close this entry.

1. `src/data/vault/journal.ts:258`: record captures its original owner, then creates and appends its line under
   the outbox lock and awaits sendWaiting for that line's outcome. `:269` assigns at only after owner resolution
   and lock admission; the owner-waiting property's arrival order now passes. The intended retry retains its
   original line and holder. `:274` retains late post-effect bookkeeping for the original folder before rejecting
   a disposed page. `:341` is the existing lock home: Web Locks when available, a shared per-page Promise mutex
   otherwise. Its tail contains no records or send outcomes. Folder discovery starts independently (`:264`),
   with its result consumed only by the locked drain; it reserves no journal id and sends no journal file.
   This preserves concurrent first-folder discovery and the lost-answer recovery test at drive-vault.test.ts:716.
2. `src/data/vault/journal.ts:361`: sendWaiting is the sole relay. It rereads each holder from the authoritative
   outbox under the lock; makeOnce/keepHeld remain the sole reservation and intent homes. `:385` drops inverses
   of originals on the failed list or refused earlier in this drain, answering their record as sent/done without
   sending them. An immediate refusal still gives its own caller the existing sentence once, rather than adding
   a second failed-list notification (`:397`). FIFO still stops at its first unresolved/waits head.
3. `src/data/spine/scripted.ts:1849`: every unpaired inverse (move, restore, Bin, rename and both rule forms)
   gets one ordinary updated row, its existing what sentence and its own path, dependent on effects and archive.
   Same-run pairs remain hidden and count zero. No report or manifest field was added.
   `src/data/spine/grounded.ts:91`: addendum 10's supporting change grounds only one updated archive row,
   one counted change, no other row kinds, no Timeline ordinal, and a captured journal file moved to the archive.
   The existing operation-id check still applies; this guard generates no rows and adds no report mechanism.
4. `src/data/contracts/note-edit.ts:644`: legacy removals without since retain exact text matching, in the
   existing removals-first sequence. Modern ordered changes retain ruleLike matching and journal-id tie ordering.
   All three literal pre-entry goldens pass byte for byte, each for LF and CRLF. ruleSequence/wordRules stay
   the one rule mechanism; the app's rules view still uses that same sequence.
5. `src/data/vault/undo-compensate.property.test.ts:505`: all seven unchanged property batches pass, including
   refused-inverse and owner-waiting, every prior invariant, the independent Drive replay oracle, and unchanged
   seeds/counts. No implementation workaround or test amendment was made in the property.
6. `src/data/vault/journal.ts:139`, `:224`, `:231`, `:375`, `:464`: addendum 10 distinguishes stored lines from
   page-only lines. Failed keeping of a stored outbox prevents its send; only the volatile outbox is authoritative
   when storage is unavailable and holds no shared lines. Malformed stored bytes remain untouched and block
   sending. A volatile offline change still gets the existing keep-this-page-open warning; a volatile change
   that reaches Drive succeeds. live.test.ts:265-275, both variants, and the late-owner bookkeeping cases pass.

removed: src/data/vault/journal.ts: record's unlocked fast path; only sendWaiting calls send.
removed: src/data/vault/journal.ts: flying and the separate original-send wait.
removed: src/data/vault/journal.ts: behind and its separate send decision.
removed: src/data/vault/journal.ts: unused drop helper and bulk reservation path; makeOnce reserves within the relay.
tests changed: none
compatibility: 4953b1ae

### Required verification

- `pnpm exec tsc -p tsconfig.app.json > /tmp/compensate-a9-tsc.log 2>&1`: PASS, exit 0.
- `pnpm exec vitest run src/data > /tmp/compensate-a9-unit.log 2>&1`: FAIL, exit 1;
  73 files passed / 1 failed, 3,819 tests passed / 1 failed. All entry reds and all seven Undo property batches pass.
- `pnpm -C runner exec vitest run > /tmp/compensate-a9-runner.log 2>&1`: PASS, exit 0;
  40 files / 314 tests. runner/test/drive-calls-golden.test.ts:21,69 asserts exactly 78 and 88, unchanged and passing.
- `git diff --check`: PASS. The diff contains four production files and this notes file; no test file changed.
- Additional diagnostics: `/tmp/compensate-a9-regression.log`, `/tmp/compensate-a9-regression-2.log`,
  `/tmp/compensate-a9-property-isolated.log`, `/tmp/compensate-a9-create-isolated.log`,
  `/tmp/compensate-a9-create-baseline.log`, `/tmp/compensate-a9-create-head.log`.
  The earlier full run's property timeouts under concurrent tsc/runner load did not recur in the final serial data run.

### Existing failure for the lead

`src/data/vault/drive-vault.test.ts:3997` (c4-create-landed), "every app create, its answer lost, against a move,
rename or Bin elsewhere: success only as it was made", fails after 60 trials, seed 20261009, path "59":
`["pile folder", "none", "after a refresh, before the retry"]`. Its retry reports done but asMade returns false
at `:4059` / `:4074`. This is the pile-folder recovery path in updatePile, not a compensating journal line.

Diagnosis boundary: the failure reproduces with the changed journal restored to HEAD, and again with ALL FOUR
changed production files restored to unchanged `d4d4dc06`; see `/tmp/compensate-a9-create-head.log` (exit 1,
identical seed/path/assertion). The implementation files were restored to this delivery afterward, without any
Git write command. The final full data run has this same single failure. This is not an entry regression, but it
prevents the required all-green delivery. Under the defect ruling process, the lead must rule on this separate
app-create recovery defect before implementation; no test, assertion, number or unrelated app-create code was changed.

Offline standard references reused from the packet's previous research and the red owner's notes:
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
- https://fast-check.dev/docs/advanced/model-based-testing/

One home per mechanism remains: journal outbox/relay and lock in journal.ts; rule order/wording in note-edit.ts;
ordinary report construction in scripted.ts, with only structural validation in grounded.ts. The coordinator must
substitute the eventual fix SHA for 4953b1ae and commit these notes separately after resolving the failed gate.


## Last round (addendum 11)

Implementation on the last-round red commit `e22c4408`, using the owner's three explicit contracts.
This checkout's DECISIONS.md contains addenda 8-10 but no addendum 11, and the adversarial note has no
"Re-plan pass" section. The owner's instructions and `/tmp/compensate-a11-red-notes.md` supply this round's
acceptance criteria. No network or Git write command was used; the coordinator owns both commits.

1. `src/data/vault/journal.ts:552`: a failed retract now leaves memory retention to the existing `keep`
   mechanism (`:224`), which retains only page-only lines when a stored outbox's keep fails. It no longer
   reinstates the stored waiting list as a page copy. The relay still rereads each line under the outbox lock
   (`:382`), so another tab's successful drop cannot be resurrected and sent. The volatile-outbox contract
   and the existing storage-failure sentence remain in the existing homes.
2. `src/data/vault/journal.ts:385`: the one relay skips a line whose own id is already on the failed list,
   settles its outcome as refused, and removes its stale outbox copy without sending. `:411` keeps newly
   refused background lines on the failed list before `:419` removes them from the outbox. A failed removal
   therefore leaves an idempotent refusal on replay, including a fresh page. The existing immediate caller
   refusal, inverse-of-refused handling, FIFO, reservation and first-intent recovery contracts are preserved.
3. `src/data/contracts/note-edit.ts:633`: the new journal-id tie order and rule identity for removals apply
   only when there is at least one removal and every removal has `since`. With no removals, or any removal
   lacking `since`, the existing stable add order and exact-text legacy removal behavior remain. The literal
   no-removal golden passes byte for byte for LF and CRLF, alongside all earlier legacy fixtures.

One home per mechanism remains: outbox retention and the locked relay in journal.ts; rule order and wording
in ruleSequence/wordRules in note-edit.ts. No other production file was changed.

tests changed: none
compatibility: d20eeaa3

Verification (output redirected; only failures and summaries read):
- Baseline confirmation of all three committed reds: FAIL, three tests / three files;
  `/tmp/compensate-a11-red-confirm.log`. The second red has two failed assertions (ordering and replay).
- The exact three reds after the fix: PASS, three tests / three files, 116 skipped;
  `/tmp/compensate-a11-red-green.log`.
  - `a page whose keep failed never sends its in-memory copy after another tab dropped the line`: PASS.
  - `a refused original stays dropped when removing it from the outbox fails`: PASS.
  - `an old manifest with no removals keeps its equal-time add order`: PASS, LF and CRLF.
- `pnpm exec tsc -p tsconfig.app.json > /tmp/compensate-a11-tsc.log 2>&1`: PASS, exit 0; empty log.
- `pnpm exec vitest run src/data > /tmp/compensate-a11-unit.log 2>&1`: FAIL, exit 1;
  73 files passed / 1 failed, 3,822 tests passed / 1 failed. Every entry test, earlier contract test and
  unchanged Undo property batch passed. The only failure is the owner's known, out-of-scope create-landed
  UTC-date defect at drive-vault.test.ts:4029, with assertions at :4059/:4074 and test entry at :3997:
  seed 20261009, path "59", `["pile folder", "none", "after a refresh, before the retry"]`.
  This run began at 2026-10-10 00:14:18 UTC, inside its first-20-minutes window. No app-create code or test
  was changed; no separate diagnosis or repair was attempted.
- `pnpm -C runner exec vitest run > /tmp/compensate-a11-runner.log 2>&1`: PASS, exit 0;
  40 files / 314 tests. Unchanged drive-calls-golden.test.ts:21 and :69 assert exactly 78 and 88.
- `git diff --check`: PASS. No test file is modified. No pnpm check or e2e was run, as instructed.

Offline standard references reused from the packet's previous research:
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction

The coordinator commits only journal.ts and note-edit.ts as the fix, replaces d20eeaa3 above with that commit's
SHA, then commits this notes section separately. No Git write command was run by this implementation session.
