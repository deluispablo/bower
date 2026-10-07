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

From drive-real-behavior-suite (TL-P3-11, minor):
- F4: the Undo toast after Bin is gone in under ~5.5 s; recheck at the P3 close against WCAG 2.2.1 Timing Adjustable.
- F5: the rename sheet closes itself after a name-clash message, so the message flashes.
- F6: an unknown `/search` route shows "Nothing here".
- F7: the move sheet's current-place label "Now in …" reads like a success.
- F8: "It may have been moved, renamed or put in the Bin." leaves the person at a dead end.

- `src/data/fake/fake-worker.test.ts` times out (5 s, 30 s) in `pnpm check` while two workers load the machine; seen in client-retry round 1 and in the worker-logs-and-version close (2026-10-07). Gate reliability.
- The note screen: a click on a task's label does nothing; only the box toggles (a native label should toggle its box). From the check 4 rerun, TL-P3-11 amendment.
- Load-sensitive e2e (P3-6 close, 2026-10-07): with a game using the CPU (load 8), qa5:38 took 46 s against a 40 s wait and robustness:11 missed its 30 s wait, on base 0b48fe4 too. At load 3 both passed (29 s, 52 s), and the full e2e:fake went 250/250. Per TL-P3-12 a pass on an idle machine is a polish note: these waits sit within 1.5x of their timeouts.

From the P3-6 delta review (PASS, minor):
- `runs.ts`: a good answer to the person's Try again after a 4xx clears `refused` but does not re-arm the beat. Run status then stays off until a foreground return or a new tidy-up. Also, `refused` is set by generation, not ticket, so a late 4xx from an older ask can stop the beat after a newer good answer. Fix: set `refused` only when `ticket > accepted`, and `schedule()` when a good answer clears it.
- `settle()`: a rename's read-back checks only the name, so a file moved elsewhere meanwhile counts as saved at the old path. A read-back 404 says "not sure… back online", which doesn't fit. A toggle conflict refreshes twice.
- `api/test/status.test.ts` has no case for an address removed from the allowlist (`requireSession` covers it).

From the P3-7 delta review (minor):
- The Worker prunes leave rows after 24 h, but the fake never does. This is harmless, since no check can be in flight that long.
- `DELETE /me` resets lease epochs to 1. This is harmless, because places are random per tab.
- `requireLease` checks once per call, as the contract says.
- `runs.ts` still clears `refused` on a stale good answer that is not accepted. It corrects itself on the next beat.
- `forget()`: an `await` sits between `deleteAll()` and `kv.put(generationFloor)`. A crash in that gap would lose the floor and the 204 (P3-7 re-review, minor).

From the P3-8 delta review (PASS, minor):
- `forget()` also wipes `quota` and `control`. Delete followed by a new sign-in resets the day's quota and the revision to 0; the client recovers, because sign-out sets `revision = -1`.
- Only the last 20 runs are kept, so a repeated old `requestId` counts as new. This is documented, and the active run is never dropped.
- `vault.ts:322`: `signedOutNow()` runs after the final write. A sign-out right after `markFolderComplete` answers 401 though the folder is complete; nothing is lost.
- `runs.ts:119`: `start()` raises `generation` and `accepted` even when it drops an older admission answer, so `/status` replies already in flight are dropped. The next poll recovers.
- There is no direct test for a run that expires while its `requestId` is repeated.

From the P3-9 delta review (minor, TL-P3-18 addendum):
- `process.ts:647`: if `mintTicket` throws after admission, `/process` answers 500. The run stays recoverable, and its requestId returns it.
- The runner's own `done` or `failed` leaves `recoveryWatch` and the alarm in place. This is harmless; the next alarm clears itself.
- The adapter's create-precheck skips the parent folder's `modifiedTime` (accepted by the reviewer: name, parents and Bin state are checked).
- P3-9 re-review (minor):
  - A ticket retired at the run's end answers the current state to any body with the same attempt and seq, not only an exact resend.
  - Superseded and ended tickets skip the expiry check; this is read-only.
  - `timingSafeEqual` after the SQL hash match does nothing now.
  - `runner.ts:12` comment wording.
- P3-10 delta review (minor, PASS):
  - process.ts: no route test for the retry where a run going ends in between and `needs-manifest` reads the inbox once (`a press whose run ended in between reads the inbox once and is admitted`).
  - process.ts: no test that a Drive failure while building the manifest answers 401 `signed-out` or 500 `internal` with no cause.
  - The contract's `/process` row does not list 409 `no-folder` (asked of the lead).
  - runner `takeAdmitted` does not check `manifest.rootId` against the grant's `folderId`.
  - runner `records.ts`: with no run id (retention), the walk also lists root-level folders named `.bower`, `runs` or `piles` (names and dates only; filtered out after).
- P3-12 delta review (minor):
  - runner/test/drive-v3.ts: the test Worker never retires a ticket, so "already done, send nothing" is tested against a 409 the real Worker never sends (a re-run after an accepted done gets 401 at token.grant, folder untouched: acceptable).
  - scripted.ts `listedPiles` never sets the Inbox's `not-tidied` flag; parity with the Inbox reader rests on capturePiles overlapping, not on a test.
- P3-12 re-review (minor, PASS):
  - run.ts: an `Effects` that returns `applied` without calling `sending()` throws UNRESOLVED and may post B_FAILURE (driveEffects cannot reach it).
  - A redispatched attempt posts `writing` after attempt 1 reported `saving` (backward phase across attempts; for spine-ordered-status).
  - 14 `bower-instance-*` temp folders from earlier test runs remain in $TMPDIR.
- First real run, staging 7a96c5e (recheck in the C16 walk):
  - When the stopped run was already seen, the button reads "Tidy up 1 thing" yet opens the old failure's sheet; the label promises a new tidy-up ("Try again" on the sheet is the way in, P2 behaviour).
  - The floating "The tidy-up stopped. See why" pill covers "Put the note in the inbox" on the add screen.
  - A stale "The tidy-up stopped" banner stays on Home.
  - `?source=real` drops from the URL after in-app navigation (data stays real).
- First real run, attempt 2 (TL-P3-19 amendment):
  - A runner that dies before its first report (token fetch failed) leaves the app at `queued` until the stale deadline.
  - One press sent two POST /process 160 ms apart (same run id, idempotent).
- P3-13 delta review (minor):
  - After `done` a new report gets 401 from the Worker (retired ticket) but 409 `stale-report` from `ReportLedger` and the contract; person.ts's ended-run 409 branch is unreachable; `ReportLedger` is used only by the contract test.
  - A ticket in flight at the v9→v10 deploy has `report_phase` null, so a backward report from that attempt answers 200 (recorded, run unchanged).
  - Each operation makes about 6 token-route calls (was 3); the check in `batch()` repeats the per-write one; the check-to-write gap remains (TL-P3-19 amendment, R1).
  - The "landed" read-back is tested only for a folder create; a create whose file no longer lists in its parent (lag, moved or binned by the person) is sent again.
- P3-13 re-review (minor, PASS):
  - No test feeds `decide()` a completed job plus a queued one at attempt 1 (must wait, not redispatch).
  - "No job listed means queued" is judged over all matched runs together; a second `tidy <id> 1` with no jobs beside a completed one redispatches (safe: the retired ticket fences it).
  - routing.test skips middleware by path (`*`, `/*`), not kind; a real `app.get('*')` would go unchecked. The red test copies the parser and matcher; no test asserts `/authx` directly.
- dispositions-match-report (left out):
  - `FakeDrive` (src/data/drive/fake-drive.ts:429,532) records text size in UTF-16 units, not bytes; non-ASCII notes get the wrong size (real Drive reports bytes).
  - A pile note whose things were filed but whose folder's Bin was rejected is still marked filed.
  - e2e:fake `[phone] qa10.spec.ts:165` flaked once under load (passed 3/3 alone).
- declare-piles-real (left out): the Worker still does not read the pile note (P3-10 limit): admission calls capturePiles with notes:false and checks a declared pile's note by key only; the declaration create goes through the lease-fenced bound(drive) but no test asserts that fencing.
- runbook-p3 (unproven against code): after a TOKEN_ENC_KEY rotation each person signs in again with consent; a stale-run redispatch fails again when GITHUB_TOKEN is missing or wrong. Check both at security-review.
- P3-14..16 delta review (minor, PASS):
  - `total` has three meanings (fresh: pile notes plus journal lines; resumed with no grant manifest: captured things; last-run.json: captured things); run-words shows all as "Reading N things".
  - A new attempt reposts `reading` when the previous one stopped before saving its manifest (recorded, not shown).
  - deploy-staging.sh: the `bower-staging` output check matches the --var echo (match `Uploaded bower-staging`); the clean-tree check ignores ignored `.env*`, and Vite reads `VITE_API_URL` from `.env.local`/`.env.production` after `env -u`; the /status wait can last ~10 min while the message says 5; the test skips give-up, a failed /health rerun and a spaced file name in the scan.
  - resumable-upload: no `sha256Checksum` after read-back says "Google Drive has a different file…" (never shown as sent); a reserved id whose file is only in the Bin asks to choose the file again.
  - plan.ts: the Worker reads no pile note, so it can admit a pile the runner holds (newer, damaged or whitespace-only note); if it is the only pile, the run fails "stopped before changing anything" and Try again repeats it.
- worker-reads-pile-notes (left out): piles the runner skips for reasons other than readiness (a words-only pile with no folder it can guess) are still admitted; after the all-held race the `done` status sends the admitted things count while last-run.json says 0.
- P3-17/18 delta review (minor, PASS):
  - All-held race: the Worker gets total 1 (admitted things) while last-run.json says 0 (captured); they also differ when only some admitted piles are held.
  - Admission and runner still disagree in rare cases (two "Pile note.md" with the first blank; names passing `writable` but failing `recordablePile`): the run ends done nothingReady after using a quota slot, never failed.
  - The duplicate-dispatch and lost-callback suites check the ending, not a single guard (re-planning and runnerReport step 6 make both idempotent).
  - Compatibility row for 3cc965f: P2 `parseRunReport` is closed and would refuse `nothingReady`; only the P2 fake runner used it.
  - `admission holds a pile whose note is not ready` passes with notes:false too; nothing tests the notes:true branch alone (e.g. a declared pile whose bound note differs from the first).
- log-no-folder-content (left out, check at the freeze review): `console.error(e)` of caught Drive/fetch errors (runner/src/drive.ts:222; src/data/spine/records.ts:183, :215, :370) were not traced for what the error carries.
- runner/test/deploy-staging.test.ts 'refuses production and dirty checkouts' timed out at 5000ms under load 26 once (passed on retry): give the script tests a longer timeout.
- P3 freeze review (minor, PASS):
  - deploy-staging.sh: `Uploaded bower-api` fails with the generic "no upload line" message, not a production alarm; check_config greps flattened text and its `//` strip also cuts `//` in https strings.
  - auth.ts: logout and the callback do not expire the old `bower_session`/`bower_oauth` (never read, harmless).
  - The landing's `'unsafe-eval'` is on the app's origin (a landing injection could call /drive/token with the cookie); narrower: precompile its x-dc script in fix-landing.mjs (P4).
  - runner/src/drive.ts:225: `res.json()` on Drive metadata is outside the try; a malformed listing would log a SyntaxError that might quote a file name. api/src/security.ts:7 points at a missing docs/security.md (P4 note).
  - (tidy.yml checkout SHA fbc6f39 verified by the coordinator with `git ls-remote`: v5 = v5.1.0.)
- harness/done.sh: on the "no assertion failed" exit after --fixed-in, the reverted files stay in the working tree (seen on rules-template-bower); restore them on every exit path.
- P3 re-freeze review (minor, PASS):
  - typed-rule.test builds Rules.md by hand from a demo seed (never red); covered together with the contract test only.
  - The fake/real Rules.md comparison is split across vault.test (constant) and fake-worker.test.
  - Any unmarked Rules.md that is not the old text costs one list plus one full read on every POST /vault (the comment says one list).
  - A failed Rules.md repair (403 Drive full, 5xx) fails the whole POST /vault on every start until it clears; best-effort log-and-skip would be safer.
  - deploy-staging upload-line test changed every host to example.test (the packet kept one real line); any other Worker name still gets the generic sentence.
- (TL-P3-28, home-sheet-and-focus) A press on "Tidy up N things" next to an unseen *stopped* run card still opens that failure first (by design: the stopped card's "See why" leads there). Lead to confirm or move to P4.
- (TL-P3-28, runner-network-retry) A Drive write that lands only after its read-back is counted as not done (the thing stays in the inbox; a later run may write it again). Rare; for the re-freeze Opus delta to judge. Changed tests: recovery.test "attempt 2 reconciles…", real-adapters "duplicate dispatch…cut mid-run", real.contract "browser close mid-run" (exit 0 → 1).
- (P3 second re-freeze review, PASS at 426a9fd; notes /private/tmp/p3-refreeze2-review-notes.md) Minors:
  - runner/src/effects.ts:241: a write landing after its read-back counts as rejected; may double a rule line.
  - runner/src/drive.ts:206: a fenced records PATCH 5xx is no longer retried; run waits in saving for the alarm.
  - src/data/wait.ts:16: an 8 MiB chunk gets ~194 s; uplink under 350 kbit/s is cut each time (resumes, may loop).
  - src/data/vault/drive-vault.ts:895: addPile create has no read-back; landed late plus retry gives a 2nd pile.
  - src/features/bower/BowerPanel.tsx:33: the "Done. N filed" card press now opens the start ask, not the result.
  - Unbounded response-body reads.
- (C16 re-walk on aeb99a4, PASS) Minors:
  - /status total and "Reading N things" count only file piles: run 37687040283 filed 2 (one words-only) with total 1.
  - The Home inbox sat on "Looking…" for about 2.5 min with 5 piles (3 orphans).
  - A new service worker waits until every tab closes (registerType autoUpdate with injectRegister script-defer, no skipWaiting):
    a reload keeps the old bundle.
- (P3 pause) Local-only branch `archive/p2-o5-snapshot` (never pushed; base b3c2eb7): uncommitted P2 O5 work kept as a P4 candidate (fake-drive WTF-8 bytes, fake-runner, pile-readiness, drive-vault).
- (P4-1 review, notes /private/tmp/p4-1-review-notes.md) Minors:
  - tidy.yml passes the Claude secret even when the provider is scripted; npm is pinned by version only.
  - claude.ts claudeArgs has no --setting-sources, so HOME ~/.claude settings or a CLAUDE.md could load.
  - Important, rated for P4-2 provider-contract: claude.ts notAdmitted lets an in-contract reply bin Resources.
    Keep claude off live until provider-contract.
  - Model-supplied digests: a model with no tools cannot compute them, so every live reply is refused (provider-contract).
- (P4-2 review, notes /private/tmp/p4-2-review-notes.md) Minors:
  - runner/test/overhead.test.ts:88: the fence check `lastToken >= 0` cannot fail after the first token, and status order is not checked.
  - runner/test/corpus.test.ts hard-codes the owner's local path to the original bench folder (skip when absent).
  - provider-contract left out: the intent has no note text, and the model sees no file contents (C15/P4-C).
- (P4-2 provider-contract, left out) Claude runs leave requests and answers waiting (not archived): P4-C, the semantic slices.
