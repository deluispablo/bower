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

- Grounding does not check Timeline sources or answer links (a web line without the web pref, a citation of something not filed, an answer naming a note never created); only the planner prevents them — P3/P4 contract.
- Rare races: a rejected requests.json write after a comparison note leads to a "(2)" note next run; a rejected questions write after the C07 note leaves the question unasked.
- `citedName` cites the plan's title, not the final name; the Job hunt line waits only for the offer's move, not its note; "A flat from the same pile…" is written even when the offer wasn't in that pile.
- With web on but the Flat 3 note missing, the lookup answers with the generic line; two same-named notes in different folders resolve to the last found.
- Run records: `putNew` keeps the cached folder if read-back throws after a create (a retry may write an identical second copy); `put`'s read-back by id no longer confirms the record sits in its run folder; the held-pile test lost its Inbox-side assertion; the pace test bound is loose.
- `PileScreen.test.tsx` "a draft whose note changed elsewhere…" fails about 1 run in 3 under full `pnpm check` load, and passes 5/5 alone (journeys B, 2026-10-06).

From the P2 batch review at `4d7ab08` (TL-P2-46, clean):

- Pile screen: any conflict reads as a clash. Clearing a words-only pile's note and saving hits "A pile with no files needs its note." but the screen says "This note changed elsewhere…" (`PileScreen.tsx:412`).
- Note: "New" marks one Timeline line per note even when a run added two (`NoteScreen.tsx:219`).
- Held piles: "Couldn't tidy this up yet" can be permanent (a Drive-added name with `/` or `\`, a pile note starting with a BOM, a file with no checksum); Try again never clears it and the Inbox offers no Remove for that reason (`PileScreen.tsx:103`).
- Runner: the bound note is parsed again without a catch, so a rare race refuses the whole run instead of holding one pile (`fake-runner.ts:417`).
- Runner: a C07 answer or C10 lookup whose line is refused waits forever; "Let Bower do it now" then says there is nothing new (P4 depth).
- Vault: a Remove failing halfway leaves the pile without its declaration, so it becomes ordinary (`drive-vault.ts:341, 610`; accepted in a comment).
- P3 cost: every old declaration is read once per session (`pile-readiness.ts:81`); a loose file trashed outside Bower costs one Bin lookup per 300 ms listing.
- Home: a C07 question shows two identical links to the same note (`Home.tsx:283`).
- Run links: report paths are fixed at run time, so a note renamed afterwards gives a dead link (`RunLinks.tsx`).

From the P2 evaluation at `4d7ab08` ([report](2026-10-06-p2-evaluation-4d7ab08.md)): M1–M10 there (sheet focus to `main`; Try again console error; fake 300 ms reload loss; fake/demo generic "Done" for comparisons after a rename; answered rent not applied to the property; phone touch targets under 44 px; "do it now" only on Home; demo menu drops `source=fake`; sign out leaves local keys; 16 vs 15 things).

Flaky under the full `e2e:fake` load at `3e6e7da` (each 6/6 alone, green on the next full run):
- `e2e/qa10.spec.ts:165` [phone] "one thing, one name": reads the tidy-up sheet's list with `allTextContents()` right after the click, without waiting, and got an empty list once.
- `e2e/robustness.spec.ts:11` [phone] "a failed tidy-up says why…": "15 things filed" not visible within 30 s once (the test takes about 53 s).

From the supplemental walk at `3e6e7da` ([report](2026-10-06-p2-supplemental-walk-3e6e7da.md)): answering a Home question leaves focus on the container, not the next question; the inbox confirmation is not found as a `status` role right after "Put the note in the inbox"; demo sign-in "Demo" + Enter stays on `/sign-in`.

From P3-1:
- `c11-no-policy-from-documents` test seeds a made-up `bower.allowWeb` localStorage key; the real per-device prefs key is `bower:prefs` (still covered, since the test snapshots all of localStorage). The web setting becomes a Worker account setting in P3; the test should then assert that setting.

From P3-2:
- `pnpm check` once failed with an unhandled `document is not defined` from a `src/ui/focus.ts` timer firing after a jsdom test environment was torn down (focusRouteHeading/returnFocusTo timers not cancelled in unit tests). Passed on rerun; if it recurs, cancel the timers in the tests or guard the callbacks.
- The architecture purity scan strips `//` comments naively, so a string containing `//` is skipped (rare gap).

From the worker-skeleton review (CLEAN): Hono cors sends Allow-Credentials/Expose-Headers and a 204 preflight to other origins (no Allow-Origin, so browsers block; tighten the test or the wording) · a misconfigured deploy answers anyone a 500 naming the missing key (env.ts:90,128) · the app-origin 404 lacks Vary: Origin (no-store makes it harmless) · **allowHeaders lacks x-bower-place and x-bower-epoch: worker-session-lease must add them** · `@cloudflare/workers-types` added; api lint uses undeclared root packages · **error codes are snake_case (not_found, internal) while the spec uses kebab-case: align when the first spec route lands** · the thrown-error test uses app.request, not SELF.
- Tooling: `harness/done.sh` code paths (`paths=` line 49) do not include `api/`, so `--fixed-in` and red mode cannot show a red for Worker entries.



From the P3-5 delta review (minor): a 409 counts as made even when that template item is now in the Bin; `vaultState` parses stored ids without a shape check; the folder listing has no paging past 1000 children.

From R2 attempt 2 (minor): `/health` reports only the package version (`0.1.0`), so a staging check cannot confirm which deploy is live; the deploy can pass the SHA as `APP_VERSION` with `--var` (lead, 2026-10-07).
