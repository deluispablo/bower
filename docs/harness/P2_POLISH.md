# P2 polish list

TL-P2-38: minors never become entries; they wait here for after the freeze. Linked from `HANDOFF.md`.

- Runner: `planRun`'s own `parseNote` can still refuse the whole plan if a pile note changes between capture and that read (narrow race).
- Runner: a rule removal relinked by a same-run rename also removes another rule whose text becomes identical (consistent with "remove every rule with that text").
- Runner: a made `Rules.md` holding zero rules would pass grounding (unreachable today).
- Runner: the merge authoring refusal has no test (needs fault injection); every link rewrite names all rename records of the run (delays archiving by a run at most).
- Runner: a note that only gets a link fix keeps last run's "new" mark one more run; an in-place mark move setting `bowerNew` is also accepted by grounding (harmless).
- Runner: other `planRun` sorts still use `localeCompare` (captured places, missing folders, hashes.json paths, journal tie-breaks).
- Runner: a declared pile whose context note was binned on purpose is checked on its first other note (held more than needed, reason shown).
- Vault: `removePile`'s memory of copies already binned is in memory only; after a reload between a failed Remove and its retry, Undo misses the first try's copies (pile comes back as ordinary, nothing lost).
- Vault: the loose declaration scan skips an unreadable copy, so a never-arrived loose file can drop out of the Inbox for one listing.
- Vault: a declaration naming another pile logs a plain string on every listing; the runner logs an unreadable declaration once per plan.
- Vault: `updatePile` turning a single file into a folder: if moving the file into the new folder fails, an empty folder pile and the loose file both show under the same pile id, and a retry saves the note into the folder without moving the file (nothing lost).
- Copy: holds that Try again cannot fix (a name with a backslash or control character, a declared member named "Pile note.md", a note starting with a byte order mark) show "Bower couldn't tidy this up yet. Try again." (TL-P2-38 one sentence); Remove on the pile screen is the way out.
- Runner: "a line added to a declared pile is its context" takes two runs on the B path (members first, then the note); converges.
- Runner: a request or rule line holding a lone surrogate makes a full tidy-up fail "Bower could not save what it did" (pre-existing; the app's own fields cannot produce it).
- Runner: when `.bower` is missing, the Saltmere-style question is not asked and its pile is filed, so the question is never asked.
- Harness: `runner-request-preflight` note still describes the pre-TL-P2-17 refusal of malformed history; the two e2e failure regexes still accept "Nothing was moved".
- Fake: the pretend Drive saves to the tab's storage on a 250 ms delay, so a reload within that window after adding a note-only pile loses it (fix: await persist before replying to every reported write, as for reservations).
- Demo vs fake: a merge does not mark the target note New in the demo's Just filed list; the fake seed writes "Today" while runs write the date, so one day shows twice in a Timeline.
- UI: links to a note later moved, renamed or binned (result card rows, a question's note) open a missing-note screen; result and question links have small tap targets; "New notes"/"Brought up to date" labels are paragraphs, not headings; the side panel's questions have no note link.
- Tests: no unit tests for the Timeline New marks or the question link (e2e only); the C11 journey reopens the merged note by address instead of a link.
- UI: `Home.tsx` and `TidySheet.tsx` compute pile emptiness inline instead of `isEmptyPile` (the tidy sheet shows a note icon for an empty pile).
- Session: the bfcache e2e does not itself show "no stale-epoch write" (the unit test does); the reload drops page-memory-only items (TL-P2-28 covers the notice).
- Tests: `src/ui/focus.ts` `focusMain` timer can fire after jsdom teardown (seen once in `runner-errors.test.tsx` under load; two reruns clean).

