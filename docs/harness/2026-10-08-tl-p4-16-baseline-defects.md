# Technical-lead decision TL-P4-16: rulings on the C05 baseline defects

The first defects handled under [DEFECTS.md](DEFECTS.md), from the C05 live baseline on `45e9742`. The diagnosis notes are in `defects/`. Each note gets `## Ruling: TL-P4-16`.

## home-empty-48s (Important): option (b), inside the consolidation

- **Cause:** pile readiness is worked out from the whole history of `.bower/piles`. With an empty Inbox, every old declaration is read, one at a time, and nothing bounds the set to the piles in the Inbox now. A second cause: a refresh drops a listing that is still on its way.
- **Ruling:** refactor first, then fix, inside TL-P4-14 stage 2. `home-reads-bounded` is replaced by `c2-pile-records` (`bower-implementer`), which comes right after `c2-read-cache`:
  - `pile-readiness.ts` gets one query, "pile records for these piles", used by the Inbox, Remove, admission read-ahead (`spine/read.ts`) and the plan;
  - declarations and dispositions are stamped in `appProperties` with their pile id and anchor kind, so records are picked from the listing and never read for the history;
  - `questions()` stops waiting for the full `piles()`;
  - the double listing goes with `c2-read-cache` (one listing in flight).
- **The fixture must have the live shape:** `live-shape.ts` gains declarations left over from filed piles. The red is an empty Inbox reading O(history) declarations. The class test is that Home's calls are the same with 10 and with 500 earlier runs, with an empty Inbox and with a full one.
- **The mechanism map** gains "Pile readiness accounting, `src/data/pile-readiness.ts`".
- **Staging** keeps the slow empty Home until stage 2. That is accepted, since production is not on the new app yet.

## write-it-again (Important): option (b), inside `c3-subject`

- **Cause:** "what Bower saw when it asked" is an optional field that the planner sets inline. An open question written before the field existed never gains it, and a missing value takes the "you changed it again" branch.
- **Ruling:** `c3-subject` owns one question builder and merge, with these rules:
  - an unanswered open question takes the evidence it lacks (state, hash) from a later ask, and never after an answer;
  - "again" is worded only when both marks exist and differ;
  - a yes whose run returns no update is never used up silently: the person sees an honest outcome;
  - the q-state question is built in one place.

  The class test includes a question in the previous release's shape.
- **Now:** verify "Write it" and its Undo on a question the current code creates, in a fresh hub state, so the baseline still covers the path. The old question in staging is closed through the app.

## words-only-pile-copy (Minor)

After its only thing was binned as a duplicate, a words-only pile briefly said its things had not arrived. That is not honest, so it goes into stage 1 `safety-polish`, using the run words.

## keep-one-not-asked (Important)

The ruling waits for its diagnosis note.

## Addendum: keep-one-not-asked (Important): option (b), in stage 3

- **Cause:** the model's reply has no way to ask about two notes, because asks ban `[[links]]` and keeping one note needs both named. A words-only pile always becomes a new note: the value gate does not apply to the pile's own words.
- **Ruling:** after `c3-subject` and `c3-reply-schema`, a new stage 3 entry `c3-pair-ask` (`bower-escalated`) builds three things:
  - a pair ask whose subject is a typed pair of notes;
  - Timeline lines that may cite a words-only pile, so news in a pile's words updates the existing note instead of becoming a new one (the value gate applies to words too);
  - the merge on a yes, reusing `keep-one-note-merge`.
- **Option (c) is rejected,** since it would be a second way to decide fit. The live proof is the real path: seeded notes and a pile, Bower asks, the answer is given in the app, and the notes merge.

**Write it, live.** At most 2 more hub runs, to get a run that proposes a state change. If neither does, the live check of Write it and its Undo moves to after `c3-subject`, and the scripted e2e covers it until then.
- **A C05 quality note, for when C05 resumes:** in about half the hub runs the model proposed no Current-state update even though the facts changed. The prompt and the corpus check address it then; no fix now.

## Addendum 2: write-it-silent

On a fresh question (`gpHq3SsL`), "Write it" started its scoped run at once (`aao9URR2`), but that run wrote nothing and the question closed silently. The scoped run asks the model again, and the model may simply not propose a state update this time. That is a design flaw, not just a missing check: a yes to "Should Bower write its update there?" must apply **the update the person was shown**, not a fresh guess.

The rule joins `c3-subject`'s ruling:
- the q-state question stores Bower's proposed text with its evidence;
- a yes applies that stored text, deterministically and through the usual fence, with no model call;
- if the section changed since, the person is asked again with the reason.

The same goes for any question whose yes means "do what you proposed".

## Addendum 4: the stage 1 smoke defects (both option b, in stage 2)

- **smoke-runner-offline.** One Drive read stalled, and the runner's retry sat inside DriveHttp's single 30 s bound, so the stall used up the whole bound and was reported as "You're offline". It is not a stage 1 regression.
  - `c2-drive-transport` gets one retry policy for every client: a timeout per attempt, idempotent GETs retried with backoff inside an overall budget, and errors mapped by context.
  - Away from a browser (the runner and the Worker), a network failure is "Google Drive didn't answer", never "offline".
  - The six sites the note lists become named acceptance tests of that entry.
- **smoke-runner-silent-stop.** A stopped attempt cannot report, so the Worker shows "queued" until the 17-minute recovery.
  - A new entry, `c2-runner-exit` (`bower-escalated`), first builds one runner exit function, so all four exit paths go through it.
  - Then comes an additive "attempt ended" report on the runner wire. The Worker arms the run's deadline 60 s after it, so recovery redispatches or ends the run honestly within about a minute.
  - An `if: failure()` workflow step is rejected, since it would be a second reporting path.
  - Test: every exit path, including an uncaught error, reaches the Worker, or the deadline recovers the run within 60 s.
- **Order.** Stage 2 opens with `c2-drive-transport` and `c2-runner-exit` in parallel; they touch different files.
