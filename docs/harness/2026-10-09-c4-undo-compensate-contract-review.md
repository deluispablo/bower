# c4-undo-compensate contract sign-off: CHANGES

Read at claude/p3 (7e329e48, src unchanged from the parked merge-base 2fa8e27b): packet, TL-P4-27, the 12 Codex findings,
journal.ts, journal-record.ts, scripted.ts (journalOf, plan section), plan.ts, pile-readiness.ts, run-manifest.ts, runner
admitted.ts and claude.ts, drive-vault.ts call sites, ARCHITECTURE map; parked 70a2b0da diff against p3.
Second way (a second cancellation logic or keeper): not stated, but see 3, 4 and 19. Severities: I = Important, M = Minor.

## A. Gaps an implementer would guess

1. I. Line shape is unspecified. Packet says only `{ kind: 'undo', undoes }` (packet:16). `isJournalRecord` (journal-record.ts:24)
   demands `v:1`, `id`, `device`, `at`, string `what`, and `KINDS` is typed `ChangeKind[]` (:19), which is also `ChangeEntry.kind`
   (types.ts:179, 199) and so reaches the UI list. Name: the exact fields (`what` text? `path`?), whether `undo` joins
   `ChangeKind` or a separate `UndoRecord` type (`JournalRecord` is `ChangeEntry & ...`, :17), the check that `undoes` is a non-empty
   string, and what an `undo` with no `undoes` is (unreadable, so left, as a bad line is today at scripted.ts:1955).
2. I. "Sent" for an undo is undefined. Packet: sent "only after its target has left the outbox, either sent or refused" (packet:17).
   In sendWaiting the target leaves at the end of the pass (journal.ts:377-380), not when its own send returns (:373-376). Say: in
   the same pass the undo goes right after its target's `sent`/`refused`; a target that answers `later` or `{waits}` holds the undo;
   and `record()` of an undo (the immediate `send(w)` at :270) checks the target first. Without it the undo goes first or never.
   A refused target (failed list, journal.ts:382-387) makes the undo moot: say whether it is still sent or dropped with it.
3. I. `retract` is undefined and its call sites change behaviour. The three line-folding sites (drive-vault.ts:331, :350, :434) call
   `remove` inside try/catch and fall back to a forward line only when it throws. A p3 `remove` also Bins a sent line's file
   (journal.ts:503-514), which is how "a thing made and then named is one change" holds online (comment at drive-vault.ts:346).
   With a local-only `retract` the common online case (line already sent) always takes the fallback: create+rename becomes two
   lines, move+Undo-move two lines, create+trash a create and a trash. Say whether that is wanted (it changes Your changes, the
   run report count `yourChanges` and the link-rewrite input `renamesFor`), or use `undo` there (fold gives one line, `yourChanges: 0`
   for the pair). A test on the real vault entry (create, rename, online) must pin the answer; the packet names none.
4. I. How admission and `journalOf` "fold" while still archiving pairs is contradictory. Contract 3 says fold at plan.ts:378 and
   scripted.ts:1931-1974 and "hold X back" when undo(X) is seen; contract 4 says X+undo(X) are both archived. If fold removes the
   pair from `lines`, nothing archives it (the archive loop is `for (const line of journal)`, scripted.ts:1883-1900) and plan.ts:410
   returns `nothing` for a pair-only journal, so the pair lingers and is re-read at every admission (subrequest budget, TL-P4-11).
   If it keeps the pair, every `lines` consumer (answers 424-464, rules 1982, renames, requests 1810) must skip it. Name fold's output
   (live, cancelled pairs, late undos, orphans, held-back) and the rule for each consumer. State fold's inputs: it also needs the
   archive listing (`journalFiles(true)`, vault-index.ts:61) to find late undos, and `contextRemoved` passes raw `unknown[]`
   (pile-readiness.ts:484), so fold must accept unknown records.
5. I. Order of fold and `tookLines` (scripted.ts:350, 2246) is not stated. If fold runs on the taken lines only, an undo that
   arrived after admission (visible, not taken) lets X be applied, against "never applies X while it can see undo(X)". If fold runs on
   all `read` lines first, then X is held while the undo is not taken: say both stay for the next run and add the test. Same for X
   unreadable, with differing copies or in two places (scripted.ts:1964): `left` lines are invisible to fold, so an undo whose X is
   left would be archived as "target nowhere" and X applied later (see 8).
6. I. The late-undo row has no data and no shape. The report's keys are closed (run-manifest.ts:377; the same closed list again in
   run-checkpoint.ts:160 and vault/layout.ts:120, which the packet does not cite). Which existing key carries it: `setAside`
   (`{name, why}`, wrong word), `updated`, `created`? Which sentence of the target does the row show: the undo line holds only
   `undoes`, so the run must read the archived target (`journalFiles(true)`), by file name `<id>.json`. That is a name match
   (WORKER checklist: match by id) and a read at plan time (Worker admission has a subrequest budget, `NotReadHere`, plan.ts:369).
   Name: how the target is found (by the `rec.id` inside the archived file), who reads it (runner only), what a target that
   cannot be read shows, the row's key and `run-words.ts` rendering (run-words.ts:130 knows none of it), and the demo/fake runners.
7. I. Packet has no list of files in scope (d-v2-07 review #12 raised the same). Missing at least: `src/data/contracts/` (fold, record
   type), run-words.ts, runner/src/claude.ts, fake-runner/fake-worker, demo/world.ts:321, live/index.ts, choose.ts, ARCHITECTURE.
8. I. "Target nowhere is archived with no effect" is unsafe by TL-P4-27's own standard ("decides on a listing"). Nowhere is
   judged on a listing (the Drive record id is not the file id, so no by-id read exists for X, journal.ts:404). A listing that lags
   a just-created X, a left X (5), or X still on another path lets the run archive the undo, and a later run applies X. Choose:
   keep an orphan undo until its target has been absent for a stated number of runs or age, or only archive it when X is
   archived. Add the race to the model.
9. I. Two undos for one target (two taps across tabs, an offline Undo plus a retry) are not covered. Fold dedupes, but the run:
   same-run pair plus a second undo gives a "late"-like or orphan row; a second undo in a later run finds X archived and claims
   "a run that started elsewhere had taken the change", false because the first undo cancelled it. Say: idempotency of the write
   (one undo per target, checked under the lock) and the run's rule for the extra one (archive with no row).
10. M. Applied-but-not-archived: X applied by run N, its archive move rejected (reportPlan 'rejected', scripted.ts:1839-1850).
    Run N+1 sees X live and undo(X) live: pair archived, yourChanges 0, but X's effect stays. "Late" is defined as "target archived"
    only. Decide (late row too, or hold) and test.
11. I. Contract 2 understates the lock change. "Every outbox send under the lock after its reserved id is stored, including the
    kept retry (:259-270)". The fresh path `await this.send(w)` at :270 is the same unlocked send, and the reserve happens inside
    `makeOnce` (journal.ts:404), not before it. Storing the id first, under the lock, removes the deliberate fast path ("no lock to take",
    :250) and restructures `send`. Name the scope, the promised latency, and which tests (journal.test.ts) will move.
12. I. Undo "always works" (packet:58) is not literally true: the p3 remove throws when the outbox cannot be stored
    (journal.ts:498-501, 'Bower could not take that change back'); an undo line needs `keep` too. Say what the person sees when
    device storage refuses (the existing "keep this page open" path at :289-295?) or drop "always".
13. I. Copy gaps in "What the person sees". (a) An undo line refused for good goes to the failed list with
    `refusedSentence` (journal.ts:50-55), whose fallback is "Your change was made, but Bower couldn't make a note of it": false for
    an undo. A fourth row and sentence are needed (designer). (b) The dock promise "the next tidy-up skips it" is false while the undo
    waits offline or behind a target that waits, and a run on another device can start first. Either two sentences (sent / kept) or the
    promise must be tied to the line having reached Drive. Without it the copy promises what is not built (WORKER checklist). (c) The
    late-undo copy covers "a run elsewhere took it", but an Undo of a removed rule or a restored note that arrives late means the
    effect (rule gone from Rules.md) stays; say what the person is told to do.
14. M. Packet lists :1313 as a "dock Undo". It is the forward action of removing a not-yet-worded rule (drive-vault.ts:1310-1316);
    the Undo of it is `addRule`. The real Undos are :1322, :1402, :469 and the move-back at :331. Fix the list so no site is missed.
15. M. Kept `undoToast` (report.ts in parked) carries the `unreached`/"Not undone yet" branch and `ErrorCode 'unreached'` (types.ts,
    drive-api.ts). With the journal out, the only raiser left is removePile (PileScreen, not `undoToast`). The packet keeps both
    `undoToast` and "goes: the Not undone yet path for journal Undos" without saying whether the branch stays (knip will flag dead
    exports; `Keeps`/`hold` in write-once `withdraw` were added for the journal's `archivedByRun` and go dead too).

## B. Races the design leaves open

16. I. Old app clients. Contract 5 secures the runner and Worker only. An open tab or other device on the old bundle calls
    `Journal.list()`, which throws on any file that is not a record ("Bower could not read your changes", journal.ts:468-473,
    `isJournalRecord` false for kind `undo`): Home and Your changes fail on that device once one undo line exists. Either the app's
    reader becomes lenient first (a third step in the release, before the writer), or the writer is gated (a capability flag from
    the Worker status, so undo is written only when every reader is new), with a test of an old reader on a new line.
17. I. The "released in two steps" is not a procedure the code enforces and conflicts with itself. "Runner and Worker first, then
    the app" (packet:30) versus "the lead deploys the app and the runner together" (packet:31). Worker admission (plan.ts, api) and
    runner capture (scripted.ts) are two deployables; both orders break: new Worker + old runner admits the undo file the old runner
    leaves uncaptured (scripted.ts:1955) and applies X; new runner + old Worker folds X away but never admits the undo, so X is
    admitted every run, held back each time, and never archived (a run loop on an `instructions` scope, plan.ts:410). Name the order of
    the three (app, Worker, runner), what each mixed pair does, and give the version-skew test an assertion that fails today.
18. M. The lock closes tabs only within one browser. Web Locks (journal.ts:338-343) are per origin and profile. Two devices
    never share an outbox, so cross-device reduces to Drive ordering. Say so in the model, and note vitest has no
    `navigator.locks`: `acrossTabs` then falls through to `work()` (journal.ts:341) and a fast-check "tabs" model proves nothing about the
    lock unless a Web Locks stub is named. fast-check is in package.json but no test uses it today.
19. I. Another reader of raw journal lines outside the four listed callers: `runner/src/claude.ts:474-481` reads `took.taken.journal`
    and counts any non-answer as "other" (`others++`, :478). An undo line makes `alone` false (forces the model path), and an
    answer X with undo(X) is still handed to the model as an answer. This is the second cancellation site the ruling forbids
    (TL-P4-27 contract 3, "the only cancellation logic"). Add it to fold's callers with a red.
20. M. Pair archive crossing the admission boundary: `outsideAdmitted` (admitted.ts:116) lets a move only on lines the run took. An
    undo that arrived after admission cannot be archived this run; X is held (5). Fine, but say it and test both orders.

## C. Cherry-picks

21. I. The cherry-pick unit is wrong. p3 has not touched any of the 25 parked src/e2e files since the merge-base, so nothing conflicts
    textually; but each parked fix commit (8d9c59ca, 189b3cb0, e23ddcde, 814fc4ec, 7e4c7476) mixes kept hunks with journal-keeper
    hunks (write-once.ts `Keeps`/`hold`, drive-vault.ts 8 hunks incl. :1016-1031 and :1533-1544, journal.ts, journal.test.ts,
    live/index.ts `outboxWaits`, choose.ts scenario `withdraw-unreached`, e2e/c4-undo-withdraw.spec.ts, features/*). Picking commits in
    order brings the journal code in and conflicts only on later commits that edit it. Say: take the kept files by path
    (`git checkout 70a2b0da -- toast.tsx toast.test.ts report.ts file-actions.ts Home.tsx BowerScreen.tsx PileScreen.tsx piles.module.css
    types.ts drive-api.ts`) and the kept hunks of write-once.ts and drive-vault.ts by hand, and drop journal.ts, live/index.ts
    `outboxWaits`, choose.ts, worker-http.ts, scenario.ts, live.test.ts, session.test.ts and bfcache/qa27 specs unless needed. List the
    files so "each named in the notes" is checkable. The parked tests in write-once.test.ts (579 lines) and drive-vault.test.ts
    mix kept and goes; list which tests stay.

## D. Reds that cannot fail today, and unverifiable

22. I. "One red for each of the 12 Codex findings" cannot be met by construction. Findings that attack structures the new design
    deletes (round 2 #1-#3 sent-lines store, round 3 #1-#2 confirmed line dropped by listing / parent check, addenda 13-14 #1, #2, #5
    `archivedByRun`, bound of confirmed lines) have no code to fail against p3 or against the new design: such reds pass vacuously
    or cannot be written. Require a table: finding to the scenario in the new vocabulary (invariant "Undo of X either dropped an
    unsent line or its undo reaches Drive/failed") with the test name, or "n/a by construction" with the reason. Round 1 #1 and #2 and
    addenda 14 #3, #4 do translate; list them with the API they go through (vault `removeRule`/`restore`, not `Journal.remove`).
23. M. The fold property tests fail on a missing module, not on an assertion (WORKER: "see it fail on an assertion"). Ship a stub
    `fold = (l) => l` so the three properties fail on assertions. Add the missing property "pairs and orphans are partitioned the same
    whatever the order, and with the archive listing present or not" once 4 is settled.
24. M. The old-line/old-report fixtures and "version-skew test" pass today (they only pin a format). Label them guards; the skew test
    needs a positive control (the current reader leaves the undo uncaptured and applies X) so it fails on the assertion once fold exists.
25. M. The model property must run through the real entry points (Journal on a fake Drive with the Web Locks stub; `capture`/`planAdmission`
    on the listing), not on a model of them (WORKER: real entry point, TL-P4-17). Admission and runner are two code paths; assert
    both ("no applied set contains X whose undo is visible").

## E. Second way

26. I. Mechanism map: there is no row for the journal, Undo or cancellation (ARCHITECTURE.md:84-110, only the write-once row names the
    outbox keeper). "Update the mechanism map row" (packet:46) has nothing to update. Add a row: cancellation = `fold` in
    `src/data/contracts/`, its callers, and "client never changes a journal file". As written, three ways coexist: `retract` (local drop),
    `undo` (line) and the kept `withdraw` (Bin of a pile create); confirm `Journal.remove` is deleted so no fourth remains.

Answered: second way in the plan as written? yes, by omission (19 and 3), not by intent.

Verdict: CHANGES. Blocking: 1, 2, 3, 4, 5, 6, 8, 11, 13, 16, 17, 19, 21, 22, 26 (and 7, 9, 12 as contract gaps).
Findings: 26.
