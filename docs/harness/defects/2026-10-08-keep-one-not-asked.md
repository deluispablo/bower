# keep-one-not-asked: a text pile about Flat 3 becomes a new note, and "keep one note" is never asked

Diagnoser note (TL-P4-15), 2026-10-08, on `claude/p3` 4a302c8 (staging 45e9742, same runner and planner code). Read-only; no code changed. Unit run: `runner/test/keep-one-note.test.ts` and `ask-answer-loop.test.ts`, 13/13 green.

## What failed

Staging, real Drive, account A (log line in `DEFECT_LOG.md`). `Projects/Flat hunt` held "Flat 3, 12 Larkspur Lane.md", the seeded corpus note "Flat 3 (second).md" (c05-keep-one-note) and "Flat 3 rent is now £1,550.md". The text-only pile "Flat 3 at 12 Larkspur Lane: second viewing booked for Saturday." ran as u_-aHtHzmiaLLWEcQNRCUg (Actions run 37827050640). The runner log says "planned 2 operations", with `timing: … model=4296 turns=1 in=7421 out=452 input=00823337123a sections=prompt:c31437,…,notes:df4188,rules:7ae47a`. It made one retry-free reply, created "Flat 3, 12 Larkspur Lane, second viewing booked.md", updated nothing and asked nothing.

## Answers to the coordinator

- **Does any live path lead to "keep one note?"** No, and the live path cannot produce one. The intent's `asks` only take a `fileId` or `pileId` (`claude.ts:230`, `:853`). The prompt mentions `keep` only after a yes (`:295-296`). The ask text must have no `[[`/`]]` (`plain`, `:851`, `:865`). Yet the keep-one recognisers need the question to name both notes as `[[links]]`: `mergesOf` (`claude.ts:494-496`) and `answerRun` (`answer-loop.ts:46-47`). A model ask always gets a `subject` (`scripted.ts:394`, `:402`), and `answerRun` routes any subject to a `scope: all` run first (`answer-loop.ts:43-44`), never the `instructions` run a merge needs. The only keep-one questions anywhere are seeded: the corpus `q-merge-flat-3` (`case.json`), `contracts/fixtures/p2/questions.json:11` and the demo (`fixture.ts:309`, `MERGES` used only when `demo`, `scripted.ts:290`). The feature entry says so: `keep-one-note-merge` was "proved with scripted proposals whose answer comes from the … fixture" (TL-P4-08 addendum 7). No entry was ever given the ask side.
- **Which notes the model saw.** *Unverified.* The log keeps only a hash of the notes section (`df4188`). `notesShown` (`claude.ts:396-417`) shows at most 12 notes and 24,000 characters for the **whole folder**. It takes hubs first, then Bower's notes by path. Selection does not depend on the pile, so "at most 5 per source" is only a prompt line (`:290`). Inside the folder the order is Flat 2, Flat 3 (second), Flat 3 rent…, Flat 3, 12 Larkspur…, so earlier hubs and `Areas/` notes can push them out. A note counts as Bower's only by the Drive property `appProperties.by` (`:404`). Edits judge by the front-matter line `by: bower` (`note-format.ts:221`, `note-edit.ts:209`, `:229`). A seeded note uploaded without the property is never shown, even though a line on it would be accepted. The corpus harness hides this: it sets the property from the front matter (`runner/test/corpus-run.ts:92`). Check the seed in Drive: does "Flat 3 (second).md" carry `appProperties.by=bower`?
- **Why create, not fit.** By construction, whatever was shown. A pile of words only is always written as a new note (`fromWords`, `scripted.ts:519`, `:1087-1094`). The intent has no way to use a pile of words as a Timeline line. `lines[].cites` must name a **placed thing** (`claude.ts:821`), and the value gate in the prompt speaks of "a thing" only (`:252-253`). A words pile the model leaves out of `notes` is skipped silently and stays in the inbox, with no question (`scripted.ts:479`). The earlier "Flat 3 rent is now £1,550.md" is the same outcome.
- **Who owns duplicate-note detection.** Nobody. `duplicate-by-hash` (`spine/duplicates.ts`) compares exact bytes of inbox things against filed files, never two notes. The method gives near-duplicates to the model ("check for near-duplicate names first", prompt `claude.ts:236-237`), but the model has no ask that reaches the merge.

## Why (5 whys)

1. **Why no question?** The model has no ask form for two notes. A question it might phrase ("keep one note") can carry no links and always gets a subject, so it would never reach `mergesOf`.
2. **Why a new note?** A text pile has exactly two outcomes in the intent: a new note, or a question. "Fit as a line" does not exist for words.
3. **Why did the tests not see it?** Every keep-one proof starts from a seeded question with the yes already given. Every value-gate proof cites a thing (a file), never a words pile. Corpus seeding also makes every `by: bower` note visible.
4. **Why were the forms missing?** Addendum 7 split C05 into the merge (the act) and the answer loop (the yes), and nobody owned the question's producer. Question kinds are recognised by English wording (`KEEP_ONE`, `claude.ts:423` and `answer-loop.ts:29`), not by a typed subject, so nothing forced the act and the ask to agree.
5. **Design cause:** the intent contract has no single list of method outcomes with a form for each. Each outcome was added as an act (keep, lines, states). Its trigger was assumed to come from somewhere else, and question kinds have no typed subject that ties the ask, the answer and the act together.

## Owner mechanism

**Model reply validation (the intent contract)**, `runner/src/claude.ts` `intentOf`, target `c3-reply-schema`. The fix also touches **Question subject and identity** (`c3-subject`, whose planned `Subject` has no "two notes" kind) and **Planning** (`scripted.ts` words piles, `c3-planner-split`). Which notes are shown (`notesShown`) has no row in the mechanism map.

## Same class elsewhere (7)

1. `claude.ts:851`/`:865` against `:494` and `answer-loop.ts:46`: ask text bans links, and keep-one recognition needs them.
2. `answer-loop.ts:43-44`: a subject routes before the keep-one check, so a model ask can never start a merge run.
3. `claude.ts:423` and `answer-loop.ts:29`: the question kind is a copied regex on wording, in two places.
4. `scripted.ts:479`: a words pile with no place waits silently, with no question and no report row (verified by reading only).
5. `claude.ts:821` (with prompt `:252`): the value gate exists for things only. Piles of words cannot fit.
6. `claude.ts:404` against `note-format.ts:221`/`note-edit.ts:229`: two tests of what counts as "Bower's note". `corpus-run.ts:92` hides the difference.
7. `scripted.ts:290` and `:1101`: merge and disagreement questions are produced only from the demo tables (`MERGES`, `DISAGREEMENTS`). Live C07 relies on a two-figure line instead (prompt `:264-265`). That may be intended; *unverified*.

## Options

- **(a) Fix in the owner. Size M, risk medium.** Change `intentOf` in two ways. First, `asks` gains a note-pair form, `{"notes":[a,b],"text","yes","no"}`, with both notes shown and distinct. The planner gives it a subject of both file ids, and `mergesOf` and `answerRun` recognise it by that subject: delete both `KEEP_ONE` regexes, keep the old `[[link]]` shape readable for open questions, and add one prompt line. Second, `lines[].cites` may name a words-only `pileId`. The pile is then captured and goes to the Bin like a cited thing, with no `fromWords` note. A words pile that is neither placed, cited nor asked about is refused (a new refusal kind), so it no longer waits silently. Make `notesShown` use the one ownership test the edits use. Risk: the open seeded questions, and the golden of the model's input.
- **(b) Refactor first, then fix. Size L, risk medium-low.** Land `c3-subject` with a "note pair" kind in the one `Subject` type, and `c3-reply-schema` with one rule per outcome. Then (a) becomes two schema rules plus one subject kind, and items 1-3 disappear by construction. Both entries are already planned (TL-P4-14).
- **(c) New mechanism. Not recommended.** A deterministic near-duplicate check (similar names or the same address in two notes) that asks "keep one note?" would be a second way to decide fit next to the model's own fit. The method gives that decision to the model, and false positives would ask the person about distinct flats. `duplicate-by-hash` stays exact-bytes only.

## Regression test (class)

"Every outcome the method names is reachable from a recorded model reply, with nothing seeded." Use the c05-keep-one-note folder with **no `questions`**, and properties set only as the app writes them (not from the front matter).
1. A reply with a note-pair ask, then yes, then `answerRun` gives `instructions`, then the merge bins the other note.
2. A words pile that only adds news to a shown note gives one Timeline line, no new note and an empty inbox.
3. A words pile left out of the reply is refused, never left silently.
4. A note is shown if and only if a line on it is accepted.

Repeat 1 for every question kind that `answerRun` maps: thing, pile, state and pair.
