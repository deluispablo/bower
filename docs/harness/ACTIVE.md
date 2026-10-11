# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

**Now:** the current state, in-flight table and queue are in HANDOFF.md, Resume (2026-10-11 wind-down). This file is the history log.

P2 closed at `00ec9a5` ([dossier](2026-10-06-p2-dossier.md)). **P3 started** ([TL-P3-01](2026-10-06-tl-p3-01-p3-start.md), P3_DRAFT adopted). Integration branch `claude/p3` (from main 93d70e9), checkout `/Users/deluisp/Projects/bower-app`. Staging from 605bbaa (ec070ce8).

- **Batch P3-1 closed** at `be87050`: c11 + console guard (+ scoped `allowConsole` in six failure-path tests, qa26 stub fix). Suites: check 3492, e2e 226, e2e:fake 250, e2e:pwa 4. 284/284.
- **Batch P3-2 closed** at `541c26c`: `shared-domain-package`, `worker-skeleton`, `done-sh-api-paths` (TL-P3-03; Haiku attempt rejected, Sonnet climb). Suites: check 3496 + api 4, e2e 226, e2e:fake 250, e2e:pwa 4; harness 287/287.
- **Batch P3-3 closed** at `5049ffa`: crypto-session, person-object, focus-timers, error-codes fix round. Suites: check 3499 + api 55, e2e 226, e2e:fake 250, e2e:pwa 4; 291/291.
- **Batch P3-4 closed** at `fada339`: `worker-google-oidc` (Opus build, Opus review CLEAN, Sonnet fix round with TL-P3-07; real red, aaea665). Suites: check 3503 + api 80, e2e 226, e2e:fake 250, e2e:pwa 4; 292/292. **Staging:** TL-P3-08 (main 184bb76) renamed the Worker `bower-staging`, added the SPA fallback and a sensor pinning the name and the staging `BOWER_KV` id; the lead deployed from d5e4a74 (version 082fbde9). `/health` and `/me` answer 500 until the owner's Google secrets are set. Next: P3-B on the lead's word after the owner signs in.
- **Batch P3-5 closed** at `4683b37`: `worker-drive-token`, `worker-vault-pointer` (Opus fix round), `vault-template-ids` (Opus delta review BLOCKING → conditional writes, closed with a real red). Suites: check 3504 + api 105, e2e 226, e2e:fake 250, e2e:pwa 4; 295/295. **R2 attempt 1 (staging 7c93f7e6, bundle `index-D8d5iY66.js`): NOT RUN.** The built-in pane holds a Google session for an account not on the allowlist, so Google signs in silently and the callback answers 403 `forbidden` (Worker tail). Asked the lead: owner signs out of Google in the pane, and/or `prompt=select_account`. **R2 attempt 2 (staging 6134569a from 11825b5, bundle `index-D8d5iY66.js`): NOT RUN, owner timeout.** The chooser appeared (`prompt=select_account` confirmed, no silent sign-in), but the browser pane stayed hidden, so the owner never saw it. Before attempt 3, the owner opens the Browser pane by hand: the tools can't show it. `/health` reports only `0.1.0`, not the deploy version. **R2 attempt 2, resumed after the owner opened the pane and signed in: steps 1–5 pass, step 6 NOT RUN.** A and B each got their own folder. Each person's Drive token answers 404 `notFound` on the other's folder, and `found:true` returns the same folder on re-entry. Step 1's first `found:false` body was not seen, though the folder was created. Step 6 (replaying A's cookie after sign-out) can't run from page script: the cookie is HttpOnly. Findings for the lead: the staging Worker has no `/status` yet, so it answers 404 and the bundle retries it about 100 times, then shows "Bower couldn't find that."; one `/sign-in?signin=failed` during A's first sign-in. **TL-P3-10: R2 passes.** **Batch P3-6 running** (packets `2026-10-07-p3-6-*`): `drive-real-behavior-suite` (evaluator, the pane signed in as A) and `client-retry-policy` (implementer, `/private/tmp/bower-p3-retry`) in parallel; then `worker-logs-and-version` (mechanical, `/private/tmp/bower-p3-logs`); then R3, R4. **drive-real-behavior-suite (staging, bundle `index-D8d5iY66.js`, as A):** browse, pagination, search, name and parent conflicts, and Bin/restore pass. A lost reply leaves Drive right (one change, no duplicate), but the app says "You're offline" and shows the old state: Important F2. The changed-version check did not run, because this build has no note edit outside the Inbox pile edit (F1). The `/status` noise is user-visible: a banner on every screen and slow screens (F3). A page-script Drive token can read all of A's Drive (`drive` scope); one listing was printed as fingerprints only. Asked the lead. **TL-P3-11 rulings applied; check 4 (task toggle) passes on its premise** (amendment e61e261): `revisions.list` on the probe note shows three revisions, each later than the last: created 06:35:36.528Z (43 bytes), changed outside 06:36:20.826Z (62 bytes), toggled in the app 06:36:38.286Z (62 bytes). Real Drive moves `modifiedTime` on every content write, and the toggle kept the outside line. **P3-6 suites (claude/p3 at a36413a, an idle machine):** pnpm check passes (in done.sh), e2e 226, e2e:fake 250 (a first run at load 8 had 6 load failures that also failed on base 0b48fe4; rerun at load 3 was clean), e2e:pwa 4; 299/299. main moves after the Opus delta review. **P3-6 closed:** delta review PASS, main = backup = `7bd77ce`. **R4:** Part B passes: the resume after a reload, md5, and a withheld final reply reconciled by a status query with no duplicate. Part A is inconclusive at slot 10: the after-triplet differed, probably Drive's `version` bump on a read. Lifecycle clean; a rerun without `version` was asked of the lead. **R3** passes, 6 of 8 dispatches:
  - dispatch to created 2 s; baselines complete in 11–13 s;
  - same-run duplicates both start, and their jobs run one after the other (the concurrency group, no cancel);
  - a lost 204 is found by run-name, with exactly one run;
  - a lost completion reconciles from the conclusion plus the `probe-report` artifact;
  - `run-name` is `probe <request id>`.

**Staging at `7bd77ce` (bundle `index-Dn2et1AP.js`):** the `/status` banner is gone, and `/status` answers 200 `{run:null}` (checked by the coordinator). **drive-real-behavior-suite check 7 rerun passes:** a lost-reply rename and move each count as saved, Drive holds each once, and the app agrees after a reload. **R4 Part A rerun** (stable on id, parents, trashed, size, md5Checksum, modifiedTime): premise **supported**. The same-id retry gives 409, the inventory is a singleton, lifecycle clean, 24 of 24 attempts. R3 and R4 are complete. **P3-7 so far:** `runs-beat-rearm` and `worker-session-lease` pass (301/301). **P3-7 suites (claude/p3 at a96c650, idle):** pnpm check passes (in done.sh at cc6b30a), e2e 226, e2e:fake 250, e2e:pwa 4; 302/302 (304 with the two P3-8 entries registered). The Opus delta review BLOCKED on one Important finding: a cookie revived after delete plus re-sign-in. Fixed by `delete-me-generation-floor` (red fixed in b10e567); the one delta re-review PASSES. P3-7 is closed. **Staging at `50108ab` (bundle `index-B7uZddDP.js`): the lease smoke passes.** A holds the place at epoch 1. A reload keeps it silently (epoch 1). A second tab on `?source=real` shows "Bower is open in another window." with Use here. Closing it leaves the first tab working. A plain new tab opens the demo source: the source is chosen per tab. **Staging at `0b64dcb` (bundle `index-Csl_E64l.js`):**
- The first `/status` calls after the deploy answered 500: the RPC receiver didn't implement `runStatus`, because the person object was still on the old class. Cloudflare's version-skew window, per the lead's tail; fixed by entry `do-version-skew`.
- At 08:33Z `/status` answered 200 `{run:null, revision:0}`.
- **/process smoke as A:** one press at 08:33:46Z gave `queued` (scope instructions), revision 1, and no dispatch. At 08:52:38Z `/status` gave `failed` with "This tidy-up took too long and stopped. Try again." after 17.0 min, revision 2. A second read stayed at revision 2, so the expiry was written once. Pass.

**Staging at `b83dc98` (bundle `index-Csl_E64l.js`): the C14 session-lease journey (session-lease-real) passes 1–5 and 7, as A on `?source=real` tabs.**
- **1.** A reload keeps the same place at epoch 1.
- **2.** A second tab shows the block screen with no Drive write and no `/process` call. The same-browser block comes from locks and the broadcast channel, with no `/session` call.
- **3.** Use here gives epoch 2; tab 1 blocks and stops polling.
- **4.** `POST /vault` with tab 1's old epoch gives 409 `stale-session`.
- **5.** With tab 2 closed, Use here in tab 1 gives epoch 3. The `leave` call itself wasn't observable.
- **7.** An outside rename in the probe folder showed after a focus return, without a reload; it was renamed back (the coordinator ran this one, after the evaluator's token read was refused by the permission system).
- **6** (expiry nobody took) was skipped.

**P3-19 (TL-P3-26):**
- Staging is at 5a4ab04 (f3e43b66); bower-home is at b7a0a82.
- `nothingReady` is approved and in the contract. `parseRunReport` already accepts it (from worker-reads-pile-notes), so no fix is needed.
- Running:
  - `security-review` passes as recorded (3f05ebf). It found 3 Important and 5 Minor (`2026-10-07-p3-security-review.md`) and corrected two runbook claims; `pnpm audit` is clean.
  - P3-20 has seven fix entries, packet `2026-10-07-p3-20-security-fixes-packet.md`. The lead says all 8 findings are fixed before the freeze. `token-key-rotation-reconsent` passes (3e8091c) and so does `tidy-pin-actions` (a23da1f; checkout fbc6f39, setup-node a0853c2); 339/344. `log-no-folder-content` passes (42880d1). 340/344. `cookie-host-prefix` passes (2cd6e75). 341/344. `instance-private-check` (89bb7f6), `app-security-headers` (f9a3ab8) and `deletion-allowlist-doc` (060df21, known-green) all pass.
- `app-security-headers`: `public/_headers` sets the CSP with the index script by hash. The landing alone needs `'unsafe-eval'` (its exported `support.js` uses `new Function`), detached with `!`; that Cloudflare detach must be checked on the deploy. The Worker sends `default-src 'none'`.
- The deploy-staging script tests now have a 30 s timeout.
- All 8 security findings are fixed; 344/344.
- **Freeze at da34905.** The four suites pass there (idle): `pnpm check` (app 3598, api 173, runner 51), e2e 226, e2e:fake 250, e2e:pwa 4. The Opus fallback review of the P3-19/20 delta (a22f288..da34905) PASSES (5 minors to polish). Local main is f5d365e (its code is da34905). **Backup pending:** at 16:58Z GitHub answered `remote rejected (Internal Server Error)` to every push, even the smallest commit after a22f288. githubstatus reported no incident, and the repo is fine (private, not archived, no rulesets). Retry later; remote main stays a22f288. Staging is at bd7e261 (code da34905, version 81a73283); bower-home is at 8703a4f with SHA-pinned actions. The backup 500 was on GitHub's side and has cleared: backup = 3389bed (19:2xZ, verified). TL-P3-27:
- The coordinator presses, under the owner's standing OK.
- The owner signs in on a fresh origin and does the revocation last.
- Made-up inputs come with expected outcomes.
- The subdomain isn't secret.
`deploy-staging-upload-line` passes (1ec5b82; script only, the app code stays frozen at da34905); 345/345. C04–C11 inputs are ready (/private/tmp/p3-c16/, not committed): one seed press plus 5 run presses. Finding: the template Rules.md lacks `by: bower`, so rules typed in the app never apply on real (note-edit.ts:206). TL-P3-27 addendum: fix first. `rules-template-bower` passes (cc28922, known-green; red at 5c203da). 346/346. **Re-freeze at cc28922:** suites green (check 3599/175/53, e2e 226, e2e:fake 250, e2e:pwa 4); delta review PASS (55cf359). Lead deployed b7d25f6 (code cc28922); main 838bf69. Site data cleared; owner signed in as A. C16 walked (notes /private/tmp/p3-c16/notes.md): PASS C01 C03 C05–C10 C12; PARTIAL C02 C04 C11 C14-5 keyboard; evaluator FAIL on 6 Important. Root cause found for C11: POST /vault (the Rules.md repair) runs only when /me has no folder (live/session.ts:111), so the cc28922 fix never reaches existing folders. TL-P3-28 (main 87b3f59): fixes rules-repair-existing-folder + runner-network-retry (escalated), home-sheet-and-focus + save-timeout-honest (implementer); packet p3-23-c16-fixes; entries 350 (346 pass). rules-repair-existing-folder passes (884829f; fix 62fa8c5). home-sheet-and-focus passes (44d2dae, known-green; red 747e8bb by hand). 348/350. runner-network-retry passes (c6f34ea). save-timeout-honest passes (426a9fd; fix 1bef02d, test fix f18397b). 350/350. **Second re-freeze at 426a9fd:** suites green (check 3608/175/59, e2e 226, e2e:fake 250, e2e:pwa 4); Opus delta PASS (6 minors to polish). Lead deployed aeb99a4 (main ec2b4c1). Re-walk PASS on aeb99a4 (bundle index-nkzmUjZs): C02 honest, C04 run 37687040283 success, C11 Rules.md by: bower + rulesWorded 1, keyboard rows pass (desktop; R1 phone too). Minors to polish. Owner deferred the live revocation (pending, covered by behavior-suites-real-adapters). P3 dossier written: docs/harness/2026-10-07-p3-dossier.md. Codex review of the P3 range 2026-10-12 before P4. Lead reviewed the dossier (main 22299b5): accurate. Worktrees cleaned (kept bower-p2-o5-snapshot: uncommitted P2 work). ON HOLD: owner accepted P3 (88bb7de); P4 not authorized; nothing starts until the lead messages. Then re-freeze, suites, Opus delta, deploy, re-walk C02 C04 C11 keyboard. Owner revocation relayed by the lead (pending). Then the C16 walk (packet `2026-10-07-p3-c16-walk-packet.md`), with one message to the lead/owner giving the exact pane steps; then the dossier. Order:
    1. `token-key-rotation-reconsent` and `tidy-pin-actions`;
    2. `app-security-headers` and `log-no-folder-content`;
    3. `cookie-host-prefix` and `instance-private-check`;
    4. `deletion-allowlist-doc`.
  - `deploy-staging-production-check` passes (6ef7934, red fixed in dab6b02). 336/337.
- Then:
  1. the security fixes;
  2. the freeze;
  3. the four suites;
  4. the Opus fallback review;
  5. the frozen deploy and the C16 walk (with the owner's revocation step);
  6. the dossier.
- The freeze does not wait for Codex (TL-P3-16); Codex reviews before P4.

**P3-17/18 (TL-P3-25):** staging is at 0abbbac (736eb6b7); bower-home is at dbd3f36.
- `deploy-staging-hardening` passes (d208635, red fixed in ba11eef). `compatibility-accepted-app` passes (4748037). It closed known-green, with its red at 4b5626c. It added 20 P2 fixtures, and its docs test requires a row in `2026-10-07-p3-compatibility.md` for every new commit under `src/features` or `src/data/contracts`. 333/335. `worker-reads-pile-notes` passes (aeaeff8, red fixed in 3cc965f). It adds an optional report field `nothingReady: true`, which needs the lead's approval; it is listed in the compatibility table. The change-list test now skips merge commits. 334/335.
- `behavior-suites-real-adapters` passes (1e66aff). It closed known-green: each of the six cases was proven red by breaking its guard. No product bug was found. P3-E is complete; 335/335.
- P3-17/18 suites at 1e66aff (idle): e2e 226, e2e:fake 250, e2e:pwa 4. The Opus delta review PASSES (aa12b03, 5 minors to polish). P3-17 and P3-18 are closed: main = backup = `a22f288`; deploy SHA sent to the lead. Next: `security-review` at the freeze, then P3-G.
- Registered for when slots free up: `behavior-suites-real-adapters` (escalated) and `compatibility-accepted-app` (implementer); packets `2026-10-07-p3-18-*`.
- Live revocation is one owner step in the C16 walk.
- After P3-17/18: `security-review` at the freeze, then P3-G.

**P3-14 (TL-P3-24):** `runner-reports-reading-total` passes (41d9a36, red fixed in 5699b61); `dispositions-match-report` passes (7bfe871, red fixed in 03bf8f6). Its verify moved to the runner tests, and the coordinator added `reading` to its expected sequence after the merge. 327/329. P3-15: `upload-queue-real` passes (ae6d9c4, red fixed in 0b05ec4; it marks a file sent by its sha256, and checks the reserved id before asking for lost bytes again). `declare-piles-real` passes (d32dc5e, known-green: the red was proven by hand after the `choose.ts` merge). P3-F: `deploy-and-migrations` passes (217fc57, red fixed in 30fc4d5; `scripts/deploy-staging.sh`, pinned schema steps). 330/330.
- Suites at d32dc5e (idle): e2e 226, e2e:fake 250, e2e:pwa 4.
- Closed:
  - the P3-14..16 Opus delta review PASSES (dcab8d7, 7 minors to polish). P3-14, P3-15 and P3-16 are closed: main = backup = `0abbbac`; deploy SHA sent to the lead.
  - `runbook-p3` passes (3906a42, known-green; red proven with a stub runbook). 331/331.
- Next for P3-E: `behavior-suites-real-adapters` and `compatibility-accepted-app`. These need the lead's scope. P3-14 and P3-15 close together (suites on an idle machine, Opus delta review). "Try again" retries that run's scope, as in P2; recheck it at C16.
- Next is P3-E: `upload-queue-real` (it folds in `upload-queue-persistent`) in parallel with `declare-piles-real`, then `behavior-suites-real-adapters` and `compatibility-accepted-app`.
- P3-F runs alongside whenever a slot is free: `deploy-and-migrations` and `runbook-p3`, then `security-review` at the freeze (SHA-pinned actions, and the P4 rate-limit note).
- Then the P3-G close: freeze, suites, the Opus fallback review, the C16 walk on the frozen SHA, and the dossier. Register the entries batch by batch.

**P3-13 (TL-P3-23):** staging runs 7a96c5e (version 32dc0f74, `GITHUB_REPO` set). The instance repository has been replaced (ed952c4), and `GITHUB_TOKEN` is set.
- `spine-ordered-status` passes (40be7b2; Worker schema v10).
- `spine-recovery-without-browser` passes (1a9955a). It reads the attempt before every fenced write; whether that may change TL-P3-19 is asked of the lead.
- 322/323.
- **First real run, attempt 1:** blocked at the press. The permission system refused the evaluator's click; the owner then allowed presses and pressed in the pane.
- **First real run, attempt 2:** FAILED. Run 37619425172 failed in 13 s because `run_worker_first` lacks `/runner/*`, so the token route served the app's page.
  - Fixed by `staging-runner-routes` (a0dcc95, red fixed in 4edd8e9; the coordinator turned its thrown error into an assertion, a2a02ad). 323/323. TL-P3-19 amendment: the runner checks the attempt before every fenced write (accepted).
  - P3-13 suites at a0dcc95 (idle): e2e 226, e2e:fake 250, e2e:pwa 4. The Opus delta review BLOCKS (1b69b33): the routing test uses a typed list (fix `routing-test-from-app`, mechanical), and recovery fails a run whose attempt-1 job finished without a report instead of redispatching it as the contract says (fix `recovery-redispatch-after-dead-job`, escalated). `recovery-redispatch-after-dead-job` passes (1ff4f12, red fixed in f04a306); `worker-stale-run-recovery` re-closed known-green with its replaced test (7da39c3). `routing-test-from-app` passes known-green (3025527; red at ce513eb, test-only); the coordinator kept `runs` and `push` in the service worker denylist (pinned by the P2 PWA test), e2e:pwa 4. 325/325. At 3025527: e2e 226, e2e:fake 250, e2e:pwa 4; the re-review PASSES (4 minors to polish). P3-13 is closed: main = backup = `16738e1`, staging at 16738e1 (e087bc91), bundle index-DPZ39-HW.js.
- **First real run, rerun:** at 12:55:41Z the coordinator pressed "Try again" on the stopped-run sheet.
  - It reached `done` on Actions (run 37624579267, success): dispatched in 7 s, done 100 s after the press.
  - But "Try again" kept the old run's scope, `instructions`, so the run read the 4 changes and filed none of the inbox. Its sheet says "Done. Bower read your changes".
  - The inbox note is still waiting.
- **First real run, inbox (scope all): PASS.** The owner said "continua" and the coordinator confirmed at 13:33:42Z.
  - Run 37629481616 was dispatched in 6 s and was done at 13:35:49Z, 2m07s after the press.
  - The note was filed to Resources/Ideas, and its inbox pile went to the Bin.
  - Findings:
    - `dispositions.json` says `set-aside` for the pile's file, while the report says `filed`;
    - `reading` is never reported (revision 9 → writing at 10);
    - `/status` shows total 0.
- **Cancel-and-recover:**
  - The coordinator added a second note and confirmed at 13:39:16Z.
  - At 13:40:00Z it cancelled run 37630230892 (attempt 1) while the run was `writing`. The app tab was moved off staging.
  - Before the cancel took effect at 13:41:01Z, the job reached `saving`.
  - The alarm redispatched exactly once, at 14:10:34Z, 4 s after the deadline. Run 37634507122 (`tidy … 2`, 24 s) brought the run to `done` at 14:10:55Z, with no app open.
  - Drive, checked by the coordinator: one filed note, one chain (checkpoints 0–11), and `last-run.json` showing done with filed 1. **PASS.**
- Questions to the lead:
  - fix entries `dispositions-match-report` and `runner-reports-reading-total`;
  - "Try again" keeps the old scope (recheck at C16);
  - what comes next.
  - The app stayed `queued` until the stale deadline.
  - One press sent two POST /process calls, with the same run id.
- After the fix: P3-13 closes, the lead deploys, and the first-run journey runs again with one press.

**P3-11 (TL-P3-22):** staging is at ca8e94e (version 47e2dd74); schema v9 applies on first use. `spine-report-barrier-dispositions` passes (6959b04, red fixed in 76f0c2f; stubs 4cce9a4); 317/317. C14 accepted by the lead (step 6 covered by lease tests, not walked). P3-11 closes with that entry alone: suites at 6959b04 (idle) e2e 226, e2e:fake 250, e2e:pwa 4; the Opus delta review BLOCKS (b5246fd) on I1 (a run that changed nothing, with a failed save, says changes were made), I2 (seq restarts at 1 and a refused `done` is swallowed) and I3 (dispositions not recorded; journal lines get none). The lead adopted the drafts (TL-P3-22 addendum, fb689e8): `report-barrier-truth-fix` is registered (packet `2026-10-07-p3-12-truth-fix-packet.md`) and is dispatched after `scripted-semantic-provider` merges; then a re-review, then P3-11 and P3-12 close together. The lead is at 8 of 10 sends: batch the questions. Minors: `saving` is posted before the chain commit; there is no catch in runTidy; the done-shortcut skips the read-back; the bundle never calls runTidy (the provider entry wires it).

**P3-12 (TL-P3-22 addendum):** `scripted-semantic-provider` passes (97dbcf2, red fixed in db9bd5f; stubs e0d7059); 318/319. `report-barrier-truth-fix` passes (d999c31, red fixed in 13e3d84); 319/319. Suites at d999c31 (idle): e2e 226, e2e:fake 250, e2e:pwa 4. The combined P3-11 re-review and P3-12 delta review BLOCKS (a53d7a2): I2 and I3 are closed, but I1 still fails on a restart whose first Drive read fails. `runner-restart-truth-fix` passes (1ecd767, red fixed in 6cf8463); 320/320. It changed only runner/ and scripts/, so the app suites at d999c31 still stand. The re-review PASSES (3 minors to polish). P3-11 and P3-12 are closed: main = backup = `7a96c5e`; deploy SHA sent to the lead, who runs new-instance.sh for the replacement and asks the owner for `GITHUB_TOKEN`. Provider notes for the lead: the runner reads piles from the folder listing, so the 'set aside, not tidied' flag is unseen (as at admission); the ticket arrives only through GITHUB_EVENT_PATH and is masked first; tidy.yml needs `contents: read`; new-instance.sh also removes the original's `agent/`. It covers: real Drive effects on the adapter (C12), `runner/workflows/tidy.yml`, adapted `scripts/new-instance.sh`. Once it is on main the lead runs new-instance.sh and pushes the replacement to the instance repository, and asks the owner for `GITHUB_TOKEN` (`wrangler secret put`).

**P3-10 (TL-P3-21):** `spine-admission-manifest` passes (9fe4042, red fixed in e52bdfd; stubs 6cc6453). `shared-domain-package` was re-closed known-green after its api import rule was renamed (72dfcdb). `spine-operations-checkpoints` passes (004c125, red fixed in 11c0409; stubs fd130bd). 316/316. Suites at 004c125 (idle): e2e 226, e2e:fake 250, e2e:pwa 4. The Opus delta review PASSES (5 minors to polish). P3-10 is closed: main = backup = `ca8e94e`; deploy SHA sent to the lead.
- Checkpoints left for later: real per-effect sends and evidence reads are passed in, not built; nothing is wired into `runner/src/main.ts`; a run ends in `saving` until the report-barrier entry.
- For the lead, at the close:
  - POST /process answers 409 `no-folder` with no folder set; the contract table doesn't list it.
  - api/tsconfig now uses Bundler resolution.
  - process.test's fixed clock moved to 2036: its stale alarm fired once the real clock passed 09:17Z.
- Known limits: a pile waits whole when one item changed; the Worker reads no pile note and does no Bin lookup.
- The console's `/status` 500s date from the version-skew window before 09:15Z.

**P3-9 (TL-P3-18/19):** `worker-runner-tickets`, `runner-drive-adapter`, `done-sh-runner-paths`, `do-version-skew`, `worker-dispatch` and `worker-stale-run-recovery` pass; 312/312. Close:
- suites at 29cc8b5 (idle): e2e 226, e2e:fake 250, e2e:pwa 4;
- the Opus delta review BLOCKED on two Important findings, fixed by `recovery-status-poll-race` (red fixed in d5c0947) and `runner-stale-attempt-signal` (red fixed in 2df1a60, per the TL-P3-18 addendum);
- the one delta re-review PASSES; 314/314.

P3-9 is closed.

**P3-8 (TL-P3-15):** `worker-process-admission` passes (33c4bc7, red from a stub commit a84cee4 fixed in 555d672) and `delete-me-inflight-vault` passes (e6ba33d); `worker-status-revision` passes (3e27d2d), 306/306. P3-8 suites (fe2dbf5, idle): pnpm check passes (in done.sh), e2e 226, e2e:fake 250, e2e:pwa 4. The Opus delta review PASSES (5 minors to polish). P3-8 is closed. **TL-P3-12–14:** the P3-6 close is on an idle machine; then the Opus delta review and R4 in parallel, then R3 (instance repository given in the prompt only); then P3-7: `worker-session-lease` (packet ready, bower-escalated) → `worker-me-and-delete` → `worker-process-admission` (with the daily quota, TL-P3-14; `worker-rate-limits` retired) + `worker-status-revision`. TL-P3-13 applies when `worker-dispatch`, `deploy-and-migrations` and `runbook-p3` are registered: the instance repository is replaced with the new app's own; the new workflows use their own event types, never `ingest` or `bower-lint`; `BOWER_API_URL` is set to the dispatching Worker; the adapted `new-instance.sh` does the replacement. Previously next: with `bower-evaluator` (packet `2026-10-07-p3-b-r2-packet.md`; owner prompts go to the lead); then `drive-real-behavior-suite`.
- **Owed acceptance items (TL-P3-04 amendment, main 11d68fd):** `worker-google-oidc` stores and checks the session generation (`assertCurrentGeneration`) and wires `SESSION_SECRET_PREVIOUS` rotation; `worker-session-lease` adds lease expiry and leave-generation columns (schema v2 with a tested v1→v2 migration); the first route that reaches the person object answers `internal` with no cause on its errors; `worker-me-and-delete` checks the allowlist on every session (one KV read), so removal ends existing sessions. New modules go stub-first (METHOD step 6) so `done.sh` shows the red.

- Evaluations: fresh origin and bundle name checked (TL-P3-01).
- P2 evidence checkouts (`/private/tmp/bower-p2-*`) can be removed.
- Resume (TL-P2-45): never clear; after a compaction re-read HANDOFF and this file; a worker gone with no delivery is redispatched fresh from its packet.

- 2026-10-09: c3-pair-ask merged bdc08775 (P4-46b PASS); design check sent to the Designer. c3-state-mark dispatched (bower-escalated, /private/tmp/bower-c3-state).

- 2026-10-09: c3-pair-ask design not verified (not-merged-never-shown); TL-P4-19 addendum 10; round 2 dispatched (/private/tmp/bower-c3-pair2, designer copy in packet). c3-state-mark told to use the answered row; integrates after pair-ask.

- 2026-10-09 restart: both workers stopped mid-fix for the plugin restart (pair-ask round 2 red c29a2862, state-mark red 1299ca14, fixes uncommitted in their worktrees; progress notes /private/tmp/*-progress.md). Resume order in HANDOFF.

- 2026-10-09: the owner authorized in the coordinator chat: c3-hooks, c3-agent-defs, c3-permissions (TL-P4-20: .claude/settings.json hooks and permissions, agent definitions, hook scripts). Packets are written for those and for c3-test-tamper and c3-flaky-policy. c3-design-gate is dropped from the queue (already closed). Order after state-mark: test-tamper and hooks, then flaky-policy, agent-defs, permissions.

- 2026-10-09 later: closed c3-test-tamper, c3-hooks (no Stop gate, addendum 3), c3-flaky-policy (batch switch E2E_BATCH=1: use it for the stage-end e2e suites). Open: c3-pair-ask round 3 part 2 (addendum 14) running; c3-state-mark round 3 (addenda 12-13, P4-47 BLOCK fold-in) after pair-ask merges; c3-permissions running; then c3-agent-defs, c3-stop-gate (serial: both edit implementer frontmatter). Load flakes logged: size-cap-test-timeout-under-load, per-thing-ask-timeout-under-load. The typescript-lsp tsserver holds worktrees open, so integrate.sh keeps them: remove by hand after checking the tree is clean.

- 2026-10-09: the lead approved a coordinator restart after c3-state-mark closes and before the four suites. After the restart: re-run the live dirty-tree stop check first (agent-defs-not-live-mid-session), then the suites with E2E_BATCH=1, main, backup (the live push hook check), the SHA to the lead, and the smoke.

- 2026-10-09: stage 3 entries all closed (c3-state-mark 5795b39b last). Ready for the coordinator restart; resume order in HANDOFF.

- 2026-10-09 stage 3 end: suites on 55ea8194 with E2E_BATCH=1: check 3905 + api 235 + runner 259, e2e 226, e2e:fake 263, e2e:pwa 4; no flaky. main = backup = 55ea8194 (scan clean). Live push hook check: the exact backup command alone is allowed; a chained command with it is refused (fail-safe). SHA sent to the lead for deploy and smoke.

- 2026-10-09 stage 4 opened (lead: stage 3 closed, smoke OK). The first-batch smoke is covered by the four suites on 55ea8194, an hour before; only docs merged since. c4-focus-return dispatched (designer signed off). v2-field is signed off and goes out when the stage-3-live-slower diagnoser frees its slot (2-worker cap).

- 2026-10-09: v2-field is verified by the designer (fa1d6258), but its close is deferred until the workers finish. done.sh failed twice on load: an e2e port clash, then the per-thing-ask timeout at load 20. Run `bash harness/done.sh v2-field ... --known-green` on an idle machine.

- 2026-10-09: ready for the third restart (subagent cap 4). Resume order in HANDOFF.

## P4 ([TL-P4-01](2026-10-07-tl-p4-01-p4-start.md), [P4_PLAN](../P4_PLAN.md))

- Owner authorized P4 (main fb33b21). HANDOFF restored to the docs-test headings (0dc5fde).
- **Batch P4-1** (packet `2026-10-07-p4-1-packet.md`, entries 352, 350 pass), from 54a7548:
  - `p4-corpus`: bower-implementer, worktree `bower-p4-corpus`;
  - `claude-provider`: bower-escalated, worktree `bower-p4-claudeprov`. Live use waits for the owner's secret.
- Next: P4-2 = original-baseline, provider-contract, then C04.
- TL-P4-01 addendum (7c80e10, speed baseline): the corpus includes the five bench cases unchanged, and the provider logs per-phase timing (both workers told). New P4-2 entry `runner-overhead` (scripted run under 60 s). Every live run goes in `p4-speed-baseline.md`; call a difference only after 3 or more runs per case.
- P4-1 closed entries: `p4-corpus` (ac3411f; 29 cases, bench 1–5 unchanged) and `claude-provider` (c98c378; Claude Code 2.1.293 pinned, confirmed on npm). 352/353.
- Running: `runner-overhead` (bower-p4-overhead, at c98c378); the P4-1 Opus delta (packet p4-1-review); check plus e2e:fake at 62a9a3e.
- Live Claude smoke after the review: the lead deploys, sets BOWER_PROVIDER=claude in bower-home, and I press one C04 case.
- provider-contract entry and packet ready (lead 1089bd1); dispatch when a slot frees. Live C04 smoke after it closes. 351/354.
- P4-1 suites at 62a9a3e: check 3608/175/66, e2e:fake 250 (green).
- `p4-corpus` re-closed (767ad48, known-green; red at 1e33a4a by hand). `runner-overhead` closed (a325441, known-green; red at dcc7005): 61.4 s → 43.4 s modelled; the real figure is unmeasured (expect about 80 s). Two more cuts (checkpoint read-back, merged checkpoints) are with the lead. 353/354.
- Running: `provider-contract` (bower-p4-provcontract, at a325441).
- Lead (a217fdd): no to the two checkpoint cuts for now. At the P4-2 close, after the deploy: 3 scripted runs on staging as A (one press each), then the live C04 smoke; all four go in p4-speed-baseline.md.
- provider-contract closed (ba70b60). 354/354. P4-2 close: suites and Opus delta (packet 2026-10-08-p4-2-review) running; then main, the lead's deploy, 3 scripted runs and the live C04 smoke.
- P4-2 review BLOCK (provider-contract: scripted demo hub line on a non-admitted note). Reopened (40e7577); fix round with the same worker, folding in the digest cache key and the name limits. 353/354.
- provider-contract re-closed (61b3c6e). 354/354. Suites must re-run on the final HEAD: the fix touched src/data/spine/scripted.ts mid-run.
- P4-2 suites on fefd3f6 (re-run after the mid-run merge; the first pass had qa5:38 and qa5:94 failing on fake desktop): check 3608/175/76, e2e 226, e2e:fake 250, e2e:pwa 4. Short Opus check of the fix round running.
- P4-2 fix-round check PASS (4 minors to polish). Next: main, backup, the lead deploys, 3 scripted runs, then BOWER_PROVIDER=claude and the C04 smoke.
- P4-2 close on staging 58897f5: 3 scripted runs at 1:59, 1:30 and 1:21; the Claude C04 smoke done in 1:50 (model 2.1 s, 1 turn), run safe, scorer FAIL (no note; the model sees no contents). P4-3 approved: runner-checkpoint-cost, with the 25 s dispatch split first.
- P4-3: runner-checkpoint-cost running (bower-escalated, bower-p4-ckpt at 62fbe3d). 354/355.
- TL-P4-03 (98886fd): runner-checkpoint-cost also caches the Claude Code install; c04-incorporation (first P4-C slice) running (bower-escalated, bower-p4-c04 at 60791e9). 354/356.
- runner-checkpoint-cost closed (da5a50b): a checkpoint is 3 Drive calls → 2 (the write's checksum replaces the read-back); modelled C04 overhead 43.4 → 38.0 s; admission now timed in parts (the split needs a staging run); no checkpoint merges (each one changes an existing test); Claude Code cached. 355/356.
- c04-incorporation closed (3453ce9; unpdf 1.8.1). runner-checkpoint-cost re-closed after the verify-name fix (59fc380). 356/356. P4-3 close: Opus delta and the four suites.
- P4-3 review BLOCK (claude.ts cache_read_input_tokens renamed; the timing undercounts). c04-incorporation reopened (509f1f9); fix round with the same worker plus 5 minors (cite freeName, size before read, link checks plus data-not-instructions, checksum-mismatch test, actions/cache v6.1.0). 355/356.
- P4-3 fix-round check PASS (3 minors to polish). Waiting for the suites at 8808970, then main, deploy, and the live C04 runs (3 or more per case).
- P4-3 suites at fe61665: check 3608/176/87, e2e 226, e2e:fake 250, e2e:pwa 4. P4-3 ready to deploy.
- deploy-scan-unpdf-literal closed (874e8f2). 357/357. Claude C04 runs: run 1 PASS, run 2 not fresh, run 3 stuck queued since 06:51:48Z (no Actions run; watching the 17-min alarm).
- TL-P4-04 (5a2f003): P4-4 running: admission-reads-cost and attempt-check-light (escalated, at b883a94); dispatch-retry (implementer) next. 357/360. Then 3 more C04 runs.
- attempt-check-light closed (ec56348): per run, token calls 71 → 2 and attempt calls 0 → 69 (from the person object, no Google call). 358/360.
- C04 Claude run 3 done after the alarm redispatch (attempt 2): PASS. Live C04 so far: 2 PASS, 1 not fresh. Model 2–3.5 s, 1 turn.
- admission-reads-cost closed (a6a9c4a): 30 → 15 calls, modelled reads 4.7 → 0.8 s, pile notes read 8 at a time; touches src/data/drive. 359/360. dispatch-retry running (implementer, at a6a9c4a).
- dispatch-retry closed (7efeab1). 360/360. P4-4 close: Opus delta and the four suites.
- P4-4 review BLOCK (dispatch-retry: the 60 s look-up fails a reporting run on a GitHub 502). Reopened (c51058d); fix round running. 359/360.
- dispatch-retry re-closed (851b5db): sent/lost/refused; the 60 s look-up leaves a reporting run alone. 360/360. A short fix-round check is running.
- P4-4 suites: e2e 226, e2e:fake 250, e2e:pwa 4 at 3f94717; check 3608/184/90 at eb856db (after the API-only fix). P4-4 ready to deploy.
- Staging c76fd2f: scripted run press to done 1:23, press to job 11 s (was 25–31); checkpoints still about 2 s each (the cost is the Drive write). P4-5 running: deploy-scan-extracted-token (mechanical) and runner-stops-when-gone (escalated), at 22a48a6. 360/362. Waiting for the lead to switch claude on for 3 C04 runs.
- C04 comparison on c76fd2f: 3/3 PASS, from fresh folders. Press to done 1:35, 1:17, 1:28; model 3–4 s, 1 turn. P4-5 closed: deploy-scan-extracted-token (22e2e2c), runner-stops-when-gone (5632d95). 362/362. P4-5 Opus delta and suites running.
- TL-P4-05 (c588797): checkpoints in the DO declined; checkpoint-per-batch running (escalated, bower-p4-ckbatch at 5c55e7d); runner-reads-and-report next; then C05. 362/364.
- P4-5 review BLOCK (runner-stops-when-gone: the token route answers 401, not 410, on revoked access). Reopened (98e6ae7); fix round running. 361/364.
- checkpoint-per-batch BLOCKED (no code): a mid-batch kill after a person's rename cannot reconcile (TL-P3-23), and 5 tests must change; ruling asked (options a/b/c). runner-reads-and-report running (implementer, at 4d8191a).
- TL-P4-05 addendum (9a12727): checkpoint-per-batch takes option (b), a bowerOp stamp on every effect; the test changes are allowed with reasons. Resumes when a slot frees.
- runner-stops-when-gone re-closed (e51d469). Delete me now keeps live ticket hashes up to 1 h, so a wrong ticket still gets 401 (the lead to confirm). checkpoint-per-batch resumed with option (b). 362/364.
- TL-P4-06 merged (the after-compact hook). HANDOFF updated for a compaction. Merged P4 worktrees removed; open: bower-p4-ckbatch, bower-p4-readsreport.
- TL-P4-04 addendum 2 (a5aba50): e51d469 keeps {runId, hash, expiresAt} and prunes only on the next write. New entry gone-ticket-rows-expire (implementer) queued for the next free slot. 362/365.
- P4-5 suites at a2dafd9: check 3608/186/92, e2e:fake 250, e2e:pwa 4; e2e 225/226 (qa10:149 desktop, a status toast timing; no src change since P4-4's green; 5 repeats green). P4-5 suites green.
- runner-reads-and-report closed (03c0e21): modelled plan reads 4150 → 1750 ms (25 → 17 reads), report 62 → 24 calls in barrier order, plan byte-equal on all 29 corpus cases. 363/365. gone-ticket-rows-expire running (implementer, bower-p4-goneexpire at 03c0e21).
- checkpoint-per-batch delivered (daa67fe): modelled C04 checkpoints 36 → 4, 37.9 → 28.3 s; deviations sent to the lead (sha256 bowerOp for Drive's 124-byte limit; 4 checkpoints). Merge conflict with reads-and-report in overhead.test.ts: the worker merges claude/p3. gone-ticket-rows-expire merged (dce7b81); done.sh green phase flaked on a 300 ms ticket margin, so the worker is widening it before the close.
- TL-P4-05 addendum 2 (ce36da1): ckbatch deviations accepted. Entry report-kept-your-change added for the C12 slice. 363/366.
- checkpoint-per-batch closed (a38306a): 4 checkpoints per run, bowerOp = 32 hex of sha256(run_id:op id); modelled C04 37.9 → 19.6 s with reads-and-report. 364/366. Waiting on the gone-ticket flake fix, then the P4-6 close.
- gone-ticket-rows-expire closed (57f8fdb). 365/366 (open: report-kept-your-change, C12). P4-6 close: Opus delta 4d8191a..57f8fdb and the four suites.
- P4-6 review BLOCK: checkpoint-per-batch makes a moved new folder twice after a mid-batch kill (stamp looked up in the planned parent only). Reopened; fix round with the same worker, plus the stamp as 32 hex (addendum 2) and a purged file set aside, not a stop. Other minors to P2_POLISH. 364/366.
- P4-6 suites at eb6baa5: check 3609/190/102, e2e 226, e2e:fake 250, e2e:pwa 4. checkpoint-per-batch re-closed (ea94775): stamp found anywhere, 32 hex, purged never-sent thing set aside. 365/366. A short Opus fix-round check is running.
- P4-6 fix-round check PASS (3 minors to polish). P4-6 closed; main moves.
- Main and backup at a566241 (remote checked). Deploy SHA sent to the lead for the real C04 measurement (3 runs). Next: C05 slice.
- C04 x3 on a566241 (staging e0b85749): press→done 0:56, 0:42, 0:43 (was 1:17–1:35); all 3 FAIL placement (Areas, not Resources; 4 dates present); timing says 8 checkpoints, not 4. Sent to the lead with an offer to investigate.
- TL-P4-07 (9f9eb22): speed counts only with 3/3 passes. Entries model-context-regression (implementer) and checkpoint-count (mechanical) added and running. 365/368.
- model-context-regression: model input on the C04 fixture byte-identical on c76fd2f and a566241 (worker stopped, no commit). Asked the lead: live-folder capture, more runs, or golden test anyway.
- TL-P4-07 addendum (50a99a1): Areas is model variance. model-context-regression becomes model-input-fingerprint (after placement-guidance); placement-guidance (implementer) running. 365/369.
- checkpoint-count closed: the 8 was the timing counter (every run record timed as a checkpoint); real writes were 4. Non-checkpoint record writes are no longer labelled on the timing line. 366/369.
- placement-guidance closed (f41f86b): the original's PARA wording in the prompt; C04 rubric allows Resources or Areas/Home linking the plot note. 367/369. model-input-fingerprint running (mechanical, at f41f86b).
- model-input-fingerprint merged (1289d2e) but not closed: the timing test passes at the red commit and the golden test writes its own file when missing. Back to the worker. 367/369.
- model-input-fingerprint closed (dd2f5f7). 368/369 (open: report-kept-your-change, C12). P4-7 Opus delta a566241..HEAD running.
- P4-7 review BLOCK: the fingerprint golden bypasses the real read path (provider aimed reads, planReads) and uses a made-up plot note. model-input-fingerprint reopened; fix round (implementer) with the minors: the citation, the [[Garden plot prefix match, putNew counting a checkpoint twice on resume, prompt wording that refers to rules the model never sees. 367/369.
- model-input-fingerprint re-closed (00d4316). 368/369. Short Opus fix-round check running.
- P4-7 fix-round check PASS (2 minors to polish). No src/e2e/api change since a566241, so the P4-6 e2e suites stand; check green at done.sh. Main moves.
- Main and backup at cd3af43. Deploy SHA sent to the lead; 5 C04 runs to follow when Claude is on.
- C04 x5 on cd3af43: 4/5 PASS (run 2 Areas). press→done 0:50–0:59 (1:46 with a runner wait). checkpoints now 4 per run. input= differs per run (raw input carries fresh file ids); asked the lead about hashing the normalised input.
- TL-P4-07 addendum 2 (c924560): 4/5 isn't the bar. Entries placement-check (implementer), fingerprint-normalised (after it), drive-calls-golden (mechanical). 368/372.
- placement-check closed (e0d8f56). Lead asked to confirm two worker choices: Rules.md shown to the model; c04-offer-and-flat fixture gained a payslip rule. fingerprint-normalised running (mechanical). 369/372.
- TL-P4-07 addendum 3 (0c1eb8b): placement-check reopened as a fix round (revert the fixture rule; responsibility basis for a new Area, shown in the report; a cut Rules.md says so). Live after: garden x5, offer-and-flat x3. 368/372.
- placement-check fix round queued (worktree bower-p4-plcheck2 at d269d5e); both slots busy (drive-calls-golden, fingerprint-normalised).
- drive-calls-golden closed (5cbbc27): 134 Drive calls on C04 at a566241 and HEAD alike; the live 35→49 s rise is Drive latency. 369/372. placement-check fix round running (implementer, bower-p4-plcheck2).
- fingerprint-normalised closed (red proven by hand at 266c99c). 370/372. placement-check fix round running.
- TL-P4-08 (f296674): the owner's second-brain method is the P4-C semantic reference. Entry second-brain-method (escalated) queued after placement-check. 370/373.
- placement-check re-closed (af15aed) after a compatibility row for 5092e03 (optional area on a filed row; app and runner deploy together). 371/373. second-brain-method running (escalated, bower-p4-method).
- Suites at b47bc52 (after placement-check): e2e 226, e2e:fake 250, e2e:pwa pass.
- second-brain-method closed (bd427ab): op asks added; c05-hub-lines and c15-scanned-letter rubrics changed (logged); left out sent to the lead (Current state change kind, type-table rows in the report, bench-4, answers to asks). 372/373. Next: P4-8 Opus delta.
- TL-P4-08 addendum (c85da86): rubric changes accepted; bench-4 unchanged. Entries ask-not-repeated (this batch), state-rewrite-change (C05), type-proposals and ask-answer-loop (C11). 372/377.
- P4-8 review BLOCK: Critical, the placement retry spawns claude after rm(work), so live every refusal ends the run; Important, the fingerprint misses fileId and admission id. placement-check and fingerprint-normalised reopened; one fix round (implementer) plus minors (rule-basis substring, New area for a subfolder, dropped Timeline lines in an asks-only run). 370/377.
- ask-not-repeated closed (test only; it already held: q-ask-<pileId> deduped by the planner). 371/377. P4-8 fix round running.
- P4-8 fix round merged (533e7b5): retry keeps its folder, fingerprint normalises fileId and admission id, whole-line rule basis, New area only top-level, ask-only runs keep uncited lines. placement-check and fingerprint-normalised re-closed. 373/377. Fix-round check (Opus) running.
- P4-8 fix-round check PASS (minors to polish). Waiting for the suites, then main and the SHA.
- P4-8 suites at 71e80f7: check 3609/190/129, e2e 226, e2e:fake 250, e2e:pwa pass. P4-8 closed; main moves.
- Main and backup at c6ddb96; deploy SHA sent to the lead for garden x5 and offer-and-flat x3.
- Garden x5 on c6ddb96: 2/5 PASS (3 runs made no note; PDF in Resources every time); input= still differs per run. offer-and-flat not run; asked the lead.
- TL-P4-08 addendum 2 (502bdc4): document-note-required (implementer) and fingerprint-normalised reopened (mechanical), in parallel; offer-and-flat waits. 372/378.
- document-note-required closed (90d5d64): .url and .md things exempt; c11 Leek soup.txt now gets a note. 373/378. fingerprint-normalised round 3 running.
- fingerprint-normalised round 3 closed (06ed7c8, test only): the fake gives equal input=; live still differs. Proposed per-section hashes to the lead. 374/378. Short Opus check of note-required next.
- TL-P4-08 addendum 3 (e35644e): input-sections (mechanical) before the SHA. 374/379.
- note-required delta check PASS (minors to polish; the fingerprint test's log write and missing main() go to the input-sections worker).
- input-sections closed (57ac56d). No src/e2e/api change since c6ddb96, so its suites stand; check 3609/190/135. Main moves.
- Main and backup at 80ae66d; SHA sent to the lead; asked to confirm the offer-and-flat reset (Bin earlier outputs, reset hubs).
- 80ae66d live: garden 5/5 PASS (only the things section varies); offer-and-flat run 1 refused (a question about a pile it also files), no retry; ruling asked. Reset done before it (Applications, listing, Flat 9 note, Viewing photos, Areas/Money binned; hubs reset to the corpus start).
- TL-P4-08 addendum 4 (1ffb63a): per-thing-ask (escalated, with retry for every refusal) and things-normalised (mechanical). 375/381.
- per-thing-ask (escalated, bower-p4-thingask) and things-normalised (mechanical, bower-p4-thingsnorm) running. Garden step timings sent to the lead (median 52.8 s: reads 14.6, apply 10.6, report 9.2, model 7.1, checkpoints 7.3).
- per-thing-ask closed (905b646; golden merge resolved with PILE_ID) and things-normalised closed (bd9c6b0; the per-run value was the pileId). 377/381. Opus check and suites running.
- P4-10 delta check PASS (minors to polish; manifest/outsideAdmitted are invariant guards the reply can't reach). Waiting for the suites.
- P4-10 suites at 222f9c0: check 3609/190/138, e2e 225/226 (qa10:149 desktop flake again; 10/10 alone; logged in P2_POLISH), e2e:fake 250, e2e:pwa pass. Main moves.
- Main and backup at b54392c; SHA sent to the lead for offer-and-flat x3 + garden x2.
- b54392c live: garden 2/2 PASS (input= equal); offer-and-flat 0/3 strict (photo asked, payslip to a new area Pay and tax records; run 1 offer not renamed; run 3 invented a 30-minute limit); things section still varies on multi-thing piles. Sent to the lead.
- TL-P4-08 addendum 5 (1c9148d): c04-prompt-fixes (implementer) and things-normalised round 2 (mechanical). Then offer-and-flat x3 + garden x1 closes C04; next drive-calls-cut beside C05. 376/382.
- c04-prompt-fixes closed (2f60dfd): numbers grounded (digits only), rawName refusal, kinds describe areas, offer-and-flat rubric change 3 logged. 377/382. things-normalised round 2 running.
- things-normalised round 2 closed (1b135a8): things sorted within a pile in the section hash (Drive listing order varied). 378/382. P4-11 delta check running.
- P4-11 check BLOCK: the prompt's naming example was the corpus answer. c04-prompt-fixes and things-normalised reopened; one fix round (implementer): a made-up example plus a no-corpus-names test, rawName false positives, money globs, things sorted in prepared(). Number minors to polish. 376/382.
- P4-11 fix round merged (ed6d2c6); c04-prompt-fixes and things-normalised re-closed. 378/382. Fix-round check running.
- P4-11 fix-round check PASS (minors to polish). Runner and corpus only since b54392c; check green. Main moves.
- Main and backup at 327b987; SHA sent to the lead for offer-and-flat x3 + garden x1 (C04 close).
- 327b987 live: C04 PASS (offer-and-flat 3/3, garden 1/1; input= stable within each case; no retries). Asked the lead to start drive-calls-cut and C05 (state-rewrite-change).
- TL-P4-08 addendum 6 (cf592bf): C04 closed. state-rewrite-change (escalated, C05) and drive-calls-cut (implementer) running. 378/383.
- state-rewrite-change closed (red by hand at bbc1d0e): new change kind for the Bower-owned Current state; compat rows added; left out: creating a missing Current state, runner undo run (C13), q-state answers (C11). 379/383. drive-calls-cut running.
- P4-12 review BLOCK (state-rewrite-change): no bower_state mark counts as Bower-owned, so person edits on existing notes are never caught. Reopened; ruling asked on the unmarked case. 378/383.
- TL-P4-10 (da18746): state-rewrite-change fix round (escalated): bowerMd5, adoption, one question per folder, minors. drive-calls-cut still running.
- drive-calls-cut closed (ce633bd): 134 -> 72 Drive calls; modelled apply 13.4 -> 3.8 s; run 19.6 -> 9.2 s; fence read reused up to 3 s. 379/383. P4-13 Opus delta running; state-rewrite fix round running.
- state-rewrite-change re-closed per TL-P4-10 (red by hand at aea3176; merged with drive-calls-cut). 380/383. Waiting for the P4-13 review, then a short check of this round.
- P4-13 review BLOCK (drive-calls-cut): the 3-s fence reuse lets a person rename between check and send be overwritten. Reopened; fix round with the same worker (fresh read right before each send, schedule clash file:F vs dir:F, barrier under the pool, bin evidence from Drive, overhead check restored). 379/383.
- state-rewrite fix-round check PASS (minors to polish). Waiting for the drive-calls-cut fix round.
- Before the owner's compaction:
  - running: `drive-calls-cut` fix round (bower-implementer, worktree /private/tmp/bower-p4-dcut2, branch claude/p4-dcut2, verify gained "a person change between the check and the send is refused");
  - main holds the first round, so don't deploy it until the fix closes. 380/383 counts drive-calls-cut as open (379 passing).
  - Next: a check of the fix, the four suites, main, the SHA, then live offer-and-flat ×3 + garden ×1 + a C05 case.
- drive-calls-cut re-closed (ee1f639): fresh fence read before every send; 134 -> 80 calls (-40.3%); modelled apply 13.4 -> 4.7 s. 380/383. Fix-round check and suites running.
- P4-13 fix-round check PASS (counts confirmed: 80 calls, apply 4.7 s modelled; minors to polish). Waiting for the suites.
- Suites at 5e756a1: check 3620/190/155, e2e 226, e2e:fake 250, e2e:pwa pass. Main moves; SHA to the lead.
- Main and backup at ba74598; SHA sent to the lead (offer-and-flat x3 + garden x1 + a C05 case suggested).
- ba74598 live: POST /process 500 on every press (no Actions run); sheet stuck on Starting. Asked the lead for the Worker stack. Presses stopped.
- TL-P4-11 (70f5897): /process 500 was Too many subrequests (free plan 50). admission-subrequest-budget (implementer) and process-error-honest (implementer) running. 380/385.
- Binned the 3 old garden pile notes from the test inbox (synthetic walk piles, TL-P4-11 point 3). The offer-and-flat pile stays for run 1. admission-subrequest-budget and process-error-honest running.
- TL-P4-11 addendum (1f91b43): ask-one-per-thing queued (both slots busy). Cause of the repeated IMG_2301 question: my resets binned and re-uploaded the pile before each run (new fileIds, so new q-ask ids), and a binned thing never closed its question. Staging leftovers to be closed through the app after the deploy. 380/386.
- process-error-honest closed (b68bc5d) and admission-subrequest-budget closed (ee5e6d6; 37 -> 33 subrequests, budget 35). 382/386. ask-one-per-thing (implementer) and a P4-14 Opus delta check of both running.
- P4-14 check BLOCK (admission-subrequest-budget): changes and dispositions are read unbounded (60 dispositions -> 65 fetches); a skipped pile note admits held or blank piles. Reopened; fix round (escalated). process-error-honest passes (one minor to polish). 381/386.
- ask-one-per-thing closed (44f4c75): questions keyed by subject and md5; closes when the thing leaves the inbox; additive. 382/386. P4-15 Opus check and the admission fix round running.
- admission-subrequest-budget re-closed (bce294b; verify widened to the fix round's red tests). P4-15 check BLOCK (ask-one-per-thing): last-thing bin leaves its question; instructions run drops all asks; pile then thing ask = 2. Reopened; fix round (implementer) and the admission fix-round check running. TL-P4-12 merged (83c6b47); style file copied (gitignored). 382/386.
- P4-14 fix-round check PASS (dispositions 65 -> 33, changes 54 -> 33; runner re-holds unread piles). Lead to accept: over budget with only held piles, a run ends 'nothing ready' instead of a 409. ask-one-per-thing fix round running.
- P4-15 fix-round check PASS (I1-I3 pinned; reader hide safe on failed listings; additive). Suites at 8821e84 running.
- Suites at 8821e84: check 3622/194/160 (failed only on the verify naming a src test from runner; fixed, re-proved at 96e7460, check green), e2e 226, e2e:fake 251 + qa10:165 phone flake (3/3 alone), e2e:pwa 4. Main moves.
- Main and backup at 2b08fc1 (merged main 516adc6, the tracked style). SHA sent to the lead: app + Worker deploy together; live offer-and-flat x3, garden x1, c05-hub-lines x2; close stale IMG_2301 questions through the app.
- 2b08fc1 live: offer-and-flat 3/3, garden 1/1, c05-hub-lines 1 pass, 2 keeps the edit (line + folder question). Findings to the lead: adoption after a refused state (Bower's append sets bowerMd5, so the next run adopts the person's section), Home 221 Drive calls / 24 s, awkward fallback line, corpus pseudo-PDF. Lead to register rate-limits refund (TL-P4-11 addendum 2) with P4-E.
- TL-P4-10/11 addenda (657c081): state-no-adoption, home-reads-once (implementers, running) and corpus-offer-real-pdf (mechanical, queued) registered. 383/389.
- state-no-adoption closed (04f2d58; red by hand at b485b75): bowerMd5 removed, unmarked = the person's unless a rule, fallback 'New: …'. state-rewrite-change verify narrowed (d95ad13). 384/389. corpus-offer-real-pdf (mechanical) dispatched; home-reads-once back for the live shape.
- home-reads-once closed (6280604): 73 -> 40 reads on a live-shaped fake folder, each file once. 385/389. P4-16 Opus check (state-no-adoption + home-reads-once) running; corpus-offer-real-pdf running.
- P4-16 check BLOCK (state-no-adoption): the fallback line repeats the person's own line as news. Reopened; fix round with the same worker (+ rewriteState guard, undo of an adopted rewrite, bowerMd5 comment). home-reads-once passes (minors to polish). 384/389.
- state-no-adoption re-closed (156b382; red by hand at 0c3f1fc): fallback names only what is new; applyChanges refuses an unmarked section without adopted; app and runner deploy together. 385/389. P4-16 fix-round check and corpus-offer-real-pdf (fixing 9 runner tests its PDFs broke) running.
- P4-16b check BLOCK (state-no-adoption): a person-edited marked section's fallback repeats Bower's last-written line. Reopened; third round with the same worker (stateMark subset, release only on a marked section, keep capitals). 384/389.
- state-no-adoption re-closed (4333308; red by hand at 50f026d). 385/389. corpus-offer-real-pdf: mechanical stalled (9 scripted tests fail once PDFs have text); escalated to a fresh Opus worker.
- P4-16c fix-round check PASS (state-no-adoption; minors to polish; compatibility table row split fixed). corpus PDFs (escalated) running.
- corpus-offer-real-pdf closed (57243c4; escalated; red by hand at 2a63292): 12 corpus PDFs real, payslip note in 4 scripted fixtures. 386/389. Suites next.
- Suites at 07ff1e4: check 3629+/194/165 harness 386/389, e2e 226, e2e:fake 251 + qa10:165 phone (2nd suite in a row; file alone 3/3 pass), pwa 4. Main moves.
- 924e6d6 on staging. qa10-phone-flake registered (implementer, running). Live c05-hub-lines x3 + Home calls next. 386/390.
- 924e6d6 live: c05 clean pass, after-edit keeps the edit (+ duplicate offer line), third run no adoption. Home ~108 Drive calls (was 221). qa10-phone-flake closed (known-green). 387/390.
- TL-P4-10 addendum 2 (59c86ab): fallback-no-duplicate, duplicate-by-hash, home-inbox-first, c05-incorporation registered. duplicate-by-hash (escalated) and home-inbox-first (implementer) running. 387/394.
- duplicate-by-hash closed (a6ee70d; escalated; red by hand at 6488613): content-hash duplicate goes to the Bin, 'already saved as'; app + runner deploy together. 388/394. fallback-no-duplicate (implementer) dispatched; P4-17 review of duplicate-by-hash after a slot frees.
- fallback-no-duplicate closed (926e725). 389/394. P4-17 Opus check (duplicate-by-hash + fallback) running; home-inbox-first back to reproduce the live delay.
- P4-17 check BLOCK (duplicate-by-hash): twin binned mid-run, changed inbox copy binned without check, pile words binned unreported. Reopened; fix round with the same escalated worker. fallback-no-duplicate passes. 388/394.
- duplicate-by-hash re-closed (28f3ee3): twin rechecked before the bin, copy bin passes md5/modifiedTime, pile words kept. 389/394. P4-17b check and home-inbox-first running.
- P4-17b fix-round check PASS (duplicate-by-hash; minors to polish). c05-incorporation (implementer) dispatched; home-inbox-first running.
- c05-incorporation blocked (branch claude/p4-c05inc, not merged): confirms-known-fact and line-not-repeated pass; hub-lines expected.json pins an ungrounded 'scored 7 out of 10'; keep-one-note needs ask-answer-loop (C11) and a merge operation. Rulings asked.
- TL-P4-08 addendum 7 (f10109d): hub-lines expected.json grounded (rubric change); keep-one-note-merge (escalated) registered on top of claude/p4-c05inc; ask-answer-loop into C05, waiting for the owner. 389/395.
- TL-P4-08 addendum 8 (5de7297): ask-answer-loop updated (answer applies at once, scoped run); queued (escalated) after keep-one-note-merge.
- home-inbox-first closed (5454151): latency fake 17 s -> 0.6 s to Inbox (7 calls before it); full read ~6 s; refresh still drops reads. 390/395. P4-18 Opus check running; c05inc grounding hub-lines.
- P4-18 check PASS (home-inbox-first; minors to polish, one on a swallowed read error). keep-one-note-merge running; ask-answer-loop waits for it (its yes-to-merge test needs the merge).
- keep-one-note-merge closed (51515f5) and c05-incorporation closed (57a9c96): C05 corpus 4/4 scripted. 392/395. P4-19 Opus check and ask-answer-loop (escalated) running.
- P4-19 check BLOCK (keep-one-note-merge): other note binned on name/place only; substring dedup drops a different fact. Reopened; fix round with the same escalated worker. ask-answer-loop running. 391/395.
- keep-one-note-merge re-closed (3680523): Bin passes what it read; whole-line compare. 392/395. P4-19b check and ask-answer-loop running.
- P4-19b fix-round check PASS (keep-one-note-merge; minors to polish). ask-answer-loop running; then suites and the C05 deploy.
- ask-answer-loop closed (694321d; red by hand at adc533f; merged claude/p3; C06 e2e line grounded). C05 entries all closed. 393/395. P4-20 Opus check and suites running.
- P4-20 check BLOCK (ask-answer-loop): copy says doing it now during a run; Write it (q-state) is never done. Reopened; fix round with the same worker. 392/395. Suites at ab223bd running.
- ask-answer-loop re-closed (bcf6f3f; Write it honest, not built). Suites green at ab223bd after killing an orphaned reviewer vite on 5191. Owner asked: findings and errors to the lead (2026-10-08-p4-c05-findings.md); waiting for the lead before the next deploy.
- TL-P4-13 (aea42fe): packet template with the checklist (packet-template.md); 6 entries registered (home-errors-shown, home-cache-stable, safety-polish, corpus-grounded-scorer, verify-names-precheck, state-yes-writes). P4-20b check and home-errors-shown running. Fix rounds now start fresh sessions.
- P4-20b check BLOCK (ask-answer-loop): waits toast promises an auto run; Write it offered then refused (lead asked: build first or reword). Reopened; fresh fix round for the toast. 392/401.
- TL-P4-13 addendum (b3b3ab7): waiting answers start their scoped run when the active run ends; state-yes-writes before the C05 deploy. ask-answer-loop round 3 redirected (escalated, fresh).
- home-errors-shown closed (84d9459). 393/401. home-cache-stable (implementer) dispatched; ask-answer-loop round 3 running.
- ask-answer-loop re-closed (749dd30; red by hand at 51730dd; compat row added by me): waiting answers start a scoped run at run end. 394/401. P4-20c check and home-cache-stable running; state-yes-writes next.
- P4-20c check PASS (ask-answer-loop; minors to polish; Worker ships first). state-yes-writes (escalated) dispatched; home-cache-stable running.
- home-cache-stable delivered but misses 2 s (3.7-4.3 s, 46 calls, floor 3.45 s); test renamed bound to the call floor; not merged; ruling asked. corpus-grounded-scorer (implementer) dispatched.
- TL-P4-13 addendum 2 (e317fc7): about 4 s accepted; home-cache-stable closed (15586a1; test renamed to its bound; compat row added by me). home-reads-bounded registered (queued). 395/402. state-yes-writes and corpus-grounded-scorer running.
- TL-P4-14 (2b7a6bb): consolidation before C06; stage 0: suites and SHA for the C05 live baseline. Nothing else starts. Also closed before the stop: home-cache-stable, corpus-grounded-scorer. 397/402.
- TL-P4-15 (19907d0) merged (b74f56a): defect workflow (DEFECTS.md); coordinator logs and dispatches bower-diagnoser, never designs fixes; packets cite the mechanism map. Stage 0 suites running.
- Stage 0 suites at e97c6ff (+ docs-only TL-P4-15 merge): check 192 runner, harness 397/402; e2e 226; e2e:fake 256; pwa 4. Main moves.
- 45e9742 C05 baseline: duplicate PASS (9Mss5enq, 75 s); hub PASS (lU3LqBFF, 89 s); Write it FAIL (YLqjlTI2 re-asked, write-it-again, diagnosed); keep-one FAIL (u_-aHtHz no merge question, diagnosing); Home empty Inbox 48 s / 126 calls FAIL (home-empty-48s, diagnosed). Undo outside the probe folder and hand-written questions.json wait for the owner's own yes in this chat.
- TL-P4-16 (03f6e30): home-empty-48s → c2-pile-records (replaces home-reads-bounded, stage 2); write-it-again → c3-subject; words-only-pile-copy → safety-polish. Rulings added to the notes. Next: Write it on a fresh question, close the old question in the app, stage 1 registration.
- Old q-state closed with Keep mine (no run, as ruled). Fresh hub run u-UNijTG (82 s): edit kept, one line, but the model proposed no state change, so no new q-state; Write it not verifiable this run. keep-one-not-asked diagnosed (note sent to the lead).
- Stage 1 registered (11 c1-* entries plus safety-polish and verify-names-precheck already open). Dispatch waits for the lead's go after the baseline.
- Write it on a fresh question: hub run gpHq3SsL asked q-state (state recorded); Write it started aao9URR2 at once (79 s) but wrote nothing and closed the question silently (write-it-silent, same class, c3-subject). Owner widened permissions in chat (Undo anywhere in A's folder; hand-written question if the real run does not ask). Hub runs done.
- TL-P4-16 addendum 2 (7661ef8): write-it-silent is a design flaw; c3-subject stores the shown text, a yes applies it with no model call (in the note; goes in c3-subject's packet). Stage 1 dispatch: c1-digest (implementer) and c1-drive-ops-table (mechanical).
- c1-digest closed (8b7eb3f3; removed 38). c1-drive-ops-table reworked (1e64a9f0 red, 6a9573dc) but not merged: it drops the live after-check for openResumable/putChunk; P4-21 review of both decides.
- P4-21: c1-digest PASS; c1-drive-ops-table BLOCK (generateIds no longer fenced, an unlisted behaviour change; on a lost lease the upload queue keeps a reserved id before openResumable refuses). Lead asked to rule read vs write for generateIds.
- TL-P4-14 addendum (11f9a52): generateIds is a write (fix round for c1-drive-ops-table queued); c1-digest-library registered (mechanical, queued). Running: c1-small-fixes, c1-worker-schema-v11.
- c1-small-fixes closed (43f2a77e). c1-worker-schema-v11 delivery not mergeable (one commit, 7 migration tests fail); fresh escalated rework. c1-drive-ops-table fix round (generateIds a write) dispatched. 399/415.
- c1-drive-ops-table closed (d172de32; generateIds a fenced write; red by hand at 1e64a9f0). 400/415. c1-digest-library (mechanical) dispatched; schema v11 rework running.
- c1-worker-schema-v11 closed (06b11309; escalated rework). 401/415. c1-worker-deadlines (escalated) dispatched; c1-digest-library running.
- c1-digest-library closed (983b360c; one commit, red by hand; row added by me). 402/415. c1-still-as-seen (escalated) dispatched; c1-worker-deadlines running.
- c1-worker-deadlines closed (7ef5a810; schema v12; removed 43). P4-22 review (escalated) running; c1-still-as-seen running. 403/415.
- P4-22 PASS (c1-worker-deadlines; minors to polish, one: a throwing handler retries forever). c1-admit-once (implementer) dispatched.
- c1-admit-once closed (65dc654d; red by hand at 6a420145); over-limit + empty inbox now 429 not 409 (lead told). c1-worker-routes (implementer) dispatched. 404/415.
- TL-P4-14 addendum 2 (dbf3b49): 429-before-409 accepted; c1-worker-deadlines reopened for backoff (6 attempts, then failed honestly); fix round queued after c1-worker-routes (both in api/src). 403/415.
- c1-still-as-seen closed (12c7b0c4; removed 63; rows added by me). P4-23 review (escalated) running; c1-worker-routes running; deadlines fix round queued. 404/415.
- P4-23 PASS (c1-still-as-seen; minors to polish). c1-duplication-gate (mechanical) dispatched; c1-worker-routes running.
- c1-worker-routes closed (047d6ad0; removed 137). 405/415. c1-worker-deadlines fix round (escalated, fresh) dispatched; c1-duplication-gate running.
- c1-duplication-gate merged (cf11d037) but not closed: its test checks jscpd, not the gate script, copies whole packages (node_modules) to tmp, and has no red. Fresh fix round (implementer).
- My error: the first c1-duplication-gate delivery was merged before pnpm check ran; its test fails typecheck (duplication-gate.test.ts:84), so check is red on claude/p3 until the gate fix round lands. c1-worker-deadlines fix round merged (63815f71, schema v13), closes after that.
- c1-duplication-gate closed (ca2396d7; gate 0.12 s; real tree 25 clones vs baseline 28, baseline not lowered: asking the lead). c1-worker-deadlines closed (70b0b6d9; schema v13). check green again. 407/415. c1-shared-contracts and c1-dependency-rules (implementers) dispatched.
- Duplication baseline set to 25 (lead ok). c1-duplication-gate reopened for a two-way ratchet (queued). DEFECT_LOG: merge-before-check process slip. 406/415.
- c1-dependency-rules closed (36d41f08); c1-shared-contracts closed (0675be81; removed 341; old leaves count as none after 24 h; new real folders' About me.md now has the app's front matter). deadlines-test-flake diagnosing. Gate ratchet fix round dispatched. 408/415.
- Lead accepted the shared-contracts choices (8b064bd). Waiting: deadlines-test-flake note, gate ratchet; then safety-polish, verify-names-precheck, suites, SHA.
- safety-polish closed as superseded (TL-P4-14 addendum 3, 03f20c6); its 8 items become acceptance tests in their owner packets: docs/harness/2026-10-08-safety-polish-carryover.md. Entry removed from features.json. Stage 1 ends with c1-api-test-harness and verify-names-precheck.
- verify-names-precheck closed (e8c65a8c); c1-api-test-harness closed (381ec99d; deadlines-test-flake fixed). Stage 1 entries all closed. 411/415. Suites next.
- Stage 1 suites at 7f738897: check (runner 192, harness 411/415), e2e 226, e2e:fake 256, pwa 4. Main moves.
- Stage 1 smoke on 9265d860: garden PASS (6-KotARu, 57 s); offer-and-flat attempt 1 stopped (smoke-runner-offline/silent-stop), recovered by the v13 deadline table at +17 min, attempt 2 PASS (75 s; only Job hunt got a hub line); c05-hub-lines PASS (YU-CNZ8, 76 s; edit kept, q-state asked); Home empty Inbox 59 s / 144 calls (home-empty-48s, stage 2). Stage 2 registration next.
- Stage 2 registered (c2-drive-transport, c2-runner-exit, c2-read-cache, c2-fake-parity, c2-one-engine, c2-write-once, c2-upload-queue-only, c2-worker-dispatch; c2-pile-records already open). Opening with c2-drive-transport and c2-runner-exit (escalated).
- c2-runner-exit closed (8c6c1343; compat row added by me on the branch before merge; smoke-runner-silent-stop fixed). P4-24 review running; c2-drive-transport running. 412/423.
- P4-24 PASS (c2-runner-exit; minors to polish). c2-worker-dispatch (escalated) dispatched; c2-drive-transport running.
- c2-drive-transport closed (13a6ecad; removed 450; dup baseline 23; smoke-runner-offline fixed). P4-25 review and c2-worker-dispatch (escalated) dispatched. 413/423.
- P4-25 BLOCK (c2-drive-transport): budget cuts slow uploads; Worker repair PATCH resent on 5xx without a fence. Reopened; fresh escalated fix round. c2-worker-dispatch running. 412/423.
- c2-drive-transport fix round merged (a0c8d806; red 0c13ad4f, fix 56b4d7fd); not closed: done.sh precheck rejects a mixed src+api verify (precheck-mixed-verify, lead asked). Opus fix-round check running; c2-worker-dispatch running. 412/423.
- P4-25b fix-round check PASS. precheck-mixed-verify fixed (51d4c6c4, lead ok). c2-drive-transport closed (ef649c93). c2-write-once gains the stamp test (lead ruling). unknown-write-copy logged: the copy says "Try again", not the ruled sentence; lead asked. 413/423.
- Addendum 6: c2-transport-outcome-kind registered (implementer, queued for a free slot); c2-write-once gains the own-unknown-write retry test. c2-read-cache dispatched on escalated (entry note) before the lead said implementer; kept. 413/424.
- 2026-10-09 overnight mode (lead relays the owner): keep going through stages 2–4 in order, two workers; never stall on a ruling (dispatch other ready entries); if a send fails or pauses, append to LEAD_QUESTIONS.md and commit; merge main before every dispatch; one combined message per closed entry or ruling; stage end: suites, SHA to the lead (lead deploys and smokes).
- c2-read-cache merged (red c716c15f, fix b87e1fe1; check green on merged tree; e2e:fake 256). Not closed: runner HOLD_MS and write-answer maps left out, net +60 prod lines, runner files now kept by listed version: lead asked. Opus review next.
- c2-read-cache rulings (main 9366148): HOLD_MS → c2-one-engine; write-answer maps → c2-write-once; runner files kept by listed version accepted; +60 accepted, stage 2 must end net negative (removed lines on every card). Close after P4-26 PASS.
- c2-worker-dispatch closed (76933a3f; red 67e59d04, fix d155dcab; schema v14, Worker only; removed 395; verify now names carry-over #4). delete-me-admit-window logged (diagnoser queued). P4-27 review queued. 414/424.
- P4-26 BLOCK (c2-read-cache): real Drive keeps every pile item's bytes read for a digest until sign-out (drive-vault.ts:867). Fresh implementer fix round. c2-transport-outcome-kind (implementer) dispatched. Queued: P4-27 review (c2-worker-dispatch), delete-me-admit-window diagnoser.
- close-before-review (process slip, lead): c2-worker-dispatch reopened as integrated-open until P4-27 PASS (also happened with c2-drive-transport 13a6ecad). P4-27 takes the next free slot. 413/424.
- c2-transport-outcome-kind merged (red b3f3eb3b, fix e3d1cc54; check green on merged tree). Open: a write with no HTTP answer (network error, timeout) keeps the offline / no-answer wording; lead asked whether that is in scope. P4-27 dispatched.
- c2-transport-outcome-kind: lead ruled no-answer writes in scope (fix round queued for the next slot, then review, then close). Queue: outcome-kind fix round, delete-me-admit-window diagnoser.
- lost-bytes-slow logged (regression from c2-drive-transport: 10 ms → 3.5 s; flakes pnpm check under load). c2-cache2 check rerun. Outcome-kind fix round dispatched.
- c2-read-cache fix round merged (red 6d3a4da1, fix 20d1e0fa; net -2; check green on merged tree on the second run, first run hit lost-bytes-slow). Verify widened. Fix-round check queued; closes after it passes.
- P4-27 BLOCK (c2-worker-dispatch): a press during recover's GitHub look-up has its dispatch-now deadline replaced by +17 min (person.ts:1023). Fresh escalated fix round (plus v13→v14 direct test, fireDue throws). delete-me-admit-window diagnosed by P4-27 §4 (predates); ruling asked.
- delete-me-admit-window ruled (main 314380d): generation floor checked in admitSync; folded into the running c2-worker-dispatch fix round. v13/v14 skew accepted.
- c2-transport-outcome-kind fix round merged (red 932794ac, fix 53b6e99f, e0aed43d; check green on merged tree); verify widened. One Opus reviewer now checks both it and the c2-read-cache fix round.
- c2-worker-dispatch fix round merged (red 9944dcc3, fix 7f5c22ee; P4-27 Important + delete-me-admit-window; check green on merged tree); verify widened. P4-29 fix-round check dispatched.
- Closed: c2-read-cache (0030e06c, P4-28a PASS), c2-transport-outcome-kind (605a34f0, red by hand at 932794ac, P4-28b PASS), c2-worker-dispatch (0da4839f, P4-29 PASS; delete-me-admit-window fixed). P4-29 minor asked: sign-out during startWaiting leaves answers waiting, no re-arm. 416/424. Next: lost-bytes-slow diagnoser, c2-fake-parity.
- sign-out-refuses-answers logged and ruled (main ada1e12); c2-worker-dispatch reopened for a small implementer fix round (queued for the next slot). 415/424.
- lost-bytes-slow ruled (b)+(a2) (main 1968a8c): c2-transport-options registered (implementer), after c2-fake-parity, before c2-one-engine. 415/425.
- c2-worker-dispatch sign-out fix round merged (red 59e3456b, fix 06871745; admission compares the kept generation floor, raised only by forget; check green on merged tree). P4-30 short check dispatched.
- c2-worker-dispatch closed again (93f6d3d4, P4-30 PASS; sign-out-refuses-answers fixed). 416/425. Running: c2-fake-parity. Next: c2-transport-options.
- c2-pile-records (implementer, home-empty-48s) dispatched in the free slot; c2-transport-options waits for c2-fake-parity (both touch the transport/fake).
- c2-fake-parity merged (red 47235356, fix 1c476094; removed 66; check green on merged tree; e2e:fake 255 + 1 flake qa10:149 passes alone). Real Drive change: binnedByItem now queries the Bin for a missing pile member (before: none); lead asked. P4-31 review queued. c2-transport-options dispatched.
- c2-fake-parity real changes accepted (main 7c9c8e8); close after P4-31. Binned-in-binned-folder test added to c2-pile-records (running worker told).
- c2-pile-records merged (red ac3d91ef/7a0cd376, fix 2ad42e53/f47a828f/40b748b9; Home golden 46→26; removed 34; check green on merged tree; e2e:fake 256). Open: unstamped old records still read once per load (no backfill) — lead asked. P4-31 (parity) + P4-32 (records) review dispatched.
- c2-pile-records ruling (main 787f0cd): fix round drops the unstamped-records branch (queued after P4-32 so its findings join the same round); questions() change accepted. Smokes from now on: fresh synthetic folder on account A (lead runs smokes).
- c2-transport-options merged (red 1fc06958, fix b788a096, 5f850604; backoff global and runner test setup gone; check green on merged tree). Verify names the 5 same-class sites + 1 extra. Net non-test +34. Open: Worker person.ts admission still uses the default real backoff (lead told). Review queued.
- Lead: Worker admission default backoff accepted (tests inject zero). Stage 2 smoke (owner still away): Bin the unstamped .bower/piles records in account A's current folder (synthetic, Bin only, within the standing permission), count in smoke notes; no new folder.
- c2-transport-options closed (523e792e, red by hand at 1fc06958, P4-33 PASS). P4-31 BLOCK (c2-fake-parity): plan.ts:125,389 keeps a has-it check, the runner has no Bin lookup (binned member ready vs held). P4-32 PASS (c2-pile-records) but the ruled fix round drops the legacy branch. Both fix rounds dispatched. 417/425.
- c2-pile-records closed (e5810bc6; home-empty-48s fixed in code). c2-fake-parity fix round merged (red b7d23243, fix df715481; removed 12; check green). qa10-toast-flake logged. P4-31b check + c2-one-engine dispatched. 418/425.
- P4-31b BLOCK (c2-fake-parity): the binned-folder files.get walk (drive-http.ts:255, from c2-pile-records) bypasses Worker subrequest grants once admission uses the Bin lookup (30 → 33 > 32). Fresh fix round 3 (implementer).
- c2-fake-parity fix round 3 merged (red fdf26db7, fix 8e176ebe; the binned-folder walk spends from the grant); verify widened; P4-31c check dispatched.
- c2-fake-parity closed (27f7be45, P4-31c PASS). 419/425. c2-upload-queue-only (implementer) dispatched; qa10-toast-flake diagnoser next slot; c2-one-engine running.
- c2-upload-queue-only merged (red aeac0faf, fix ed2430de, d6e03f80; app code -101/+63; check + full e2e:fake 256 green on merged tree). Open: the queue sends one file at a time, so Try again on pile A waits behind pile B's slow file (unlisted behaviour change; lead asked); late-file Bin-retry branch untested. P4-34 review dispatched.
- c2-upload-queue-only: serial queue accepted; the late-file Bin-retry branch gets a test (or is deleted if unreachable) before closing, after P4-34.
- P4-34 PASS (c2-upload-queue-only). Short fix round: a test for the late-file Bin-retry branch (lead), plus the dead code P4-34 lists. late-upload-undo-resend logged (lead asked).
- c2-one-engine merged (red 3b3bff20, fix b425fdd3, 82170ad0; prod -147; HOLD_MS gone; dup baseline 22; C04 still 80; check + full e2e:fake 256 green on merged tree). Two rulings asked (lost-reply move purged before read-back stays set aside; edit-text time-only change now refused in the fake as in the runner). P4-35 review dispatched.
- c2-one-engine rulings (main fe2b3c8): lost-answer move purged → outcome-unknown kind (fix round after P4-35, findings joined); strict edit-text rule kept in both.
- My slip: a main merge conflicted (docs/ARCHITECTURE.md) and my chained commit -am recorded the conflict markers (5cfcb689); resolved with the lead's rows in 022194da minutes later. Rule for me: merge main with && and stop on a conflict.
- P4-35 BLOCK (c2-one-engine): a move destination kept for the whole attempt (runner/src/drive.ts:187) does not see a destination binned mid-run; the answer says trashed:false, so it is reported applied. Fresh escalated fix round with the lead ruling (lost-answer purged move → unconfirmed) and the honesty minors.
- qa10-toast-flake ruled (b) (main 7a708aa): c4-focus-return registered (opens stage 4). Until then rerun qa10 alone when it fails; never loosen it. 420/426.
- c2-one-engine fix round merged (red 90cf9577, fix 3f642845; move reads its destination at the write boundary, no clock; C04 80→82 and the golden bound raised to 82: lead to weigh; check green on merged tree, e2e:fake 256). Open: summary counts unconfirmed rows as "set aside"; barrier test changed from failed to done. P4-35b check dispatched.
- c2-one-engine rulings (main 19609e7): 82 accepted; round 3 (after P4-35b) adds the "couldn't confirm N" summary line and fence-cannot-read → stopped (barrier test ends stopped).
- P4-35b BLOCK (c2-one-engine): matches the lead rulings 2 and 3 (unconfirmed row counted as set aside; failed fence read ends done with code offline headless). Round 3 (escalated) dispatched.
- c2-one-engine round 3 merged (red bd5fe99d, fix 70585d02; unconfirmed summary line; cannot-read fence stops for recovery; check green, e2e:fake 256). P4-35c check dispatched.
- P4-35c BLOCK (c2-one-engine round 3): the attempt-route fence (runner/src/drive.ts:388 stillCurrent) is not wrapped in seen.read, so its no-answer still ends done/offline. Round 4 (escalated) dispatched.
- c2-one-engine round 4 merged (red 54e6c5d6, fix 7fa1bcb7; every fence read through one cannot-read path; per-move counts; check green, e2e:fake 256). headless-offline-lost-write logged. P4-35d check dispatched.
- c2-one-engine closed (b0d56509, P4-35d PASS). 421/426. c2-write-once (escalated) dispatched; last of stage 2.
- Lead: the report-row-by-name minor moves from polish to c3-planner-split (named test), recorded in docs/harness/2026-10-09-stage3-carryover.md until stage 3 is registered.
- Lead quality check: production net since 9265d860 is +307 (engine -356, drive-http +21, person.ts +118). c2-write-once told to remove the six recovery methods fully, report production-only lines, and remove what is dead in drive-http. Stage end: send the production-only net and why drive-http did not shrink.
- c2-write-once merged (red ce4ae5e8, fix b1bceabf; prod -214; C04 82→76; check green on merged tree; e2e:fake 256). Rulings asked: `ended` patch log kept (removing costs 76→126); journal outbox recovery kept (by name + field, archive move overwrites bowerOp); barrier test title kept but body changed. P4-36 review dispatched.
- c2-write-once rulings (main dd77054): keep ended; journal line key + barrier rename in the fix round after P4-36.
- P4-36 BLOCK (c2-write-once): once() accepts a stamp match without checking md5 (drive-vault.ts:1679): a retry after a change elsewhere says saved and the cache can later overwrite the person's edit. Round 2 (escalated) with the lead rulings (journal key, barrier rename) and the P4-36 minors on app writes without bowerOp and engine answered() name check.
- c2-create-by-id registered (escalated; main 9ffa36e): last stage 2 entry, after the c2-write-once round 2. 421/427.
- c2-write-once round 2 merged (red f765fd93/0fd9101a, fix 1fc5edf7; stamp + checksum; journal line key; prod +19; C04 76). Two tests renamed to what they assert and their entries re-proved (journal-ack-content, spine-report-barrier-dispositions). Still-unstamped app writes (trash/untrash/update, keyed pile creates, shortcuts, system folder) → c2-create-by-id helper (lead told). P4-36b check dispatched. 421/427.
- c2-write-once closed (f77a1282, P4-36b PASS). 422/427. c2-create-by-id (escalated) dispatched with the unstamped list and the P4-36b minors.
- c2-create-by-id merged (red 01afad9d, fix 9a07ce00; 17 named tests; prod -8; C04 76; check green on merged tree; e2e:fake 256). Lead asked: app creates cost one generateIds each; a person retry after a double failure makes a new file; fake Worker still makes its template without ids; journal line key stays. P4-37 review dispatched.
- c2-create-by-id rulings (main 921d957): fix round after P4-37 (id per intended create kept with the pending action; fake Worker through the helper; batch reservation).
- P4-37 PASS (c2-create-by-id); fix round dispatched with the lead rulings (main 921d957) and P4-37 minors (holds() checks trashed state, generateIds chunked by 1000, remaining unstamped runner/Worker writes).
- c2-create-by-id fix round merged (red 0709119f, fix 18b1abba; ids per intended create kept with the pending action; fake Worker on the helper; chunks of 1000; foreign stamp → unconfirmed; prod +207/-109; C04 76; check green, e2e:fake 256). keepFinished (retention) has no production caller: dead code, lead told. P4-37b check dispatched.
- Stage 2 production net since 9265d860: +167 (lead asked how to close). keepFinished removal at the stage end; retention is a post-P4 product question.
- Lead: stage 2 closes at +167 (main 7ccb60f); condition: jscpd clones ≤ 22 at the stage end. keepFinished removal dispatched (mechanical).
- keepFinished removal held: it is TL-P3-21 retention, promised by closed entry spine-operations-checkpoints and never wired (retention-never-wired logged).
- retention-never-wired ruled (a) (main f9e2515): spine-operations-checkpoints reopened; escalated wiring round dispatched. 421/427.
- c2-create-by-id closed (8322ae27, P4-37b PASS). 422/427. Two P4-37b minors asked of the lead (journal 4xx reserved id waits forever; pile-note retry with new words makes a second note). Waiting: retention wiring (spine-operations-checkpoints), then the stage 2 suites.
- Two P4-37b defects ruled (main cb4f7c8); c2-create-by-id reopened; implementer round queued after the retention round. 421/427.
- Retention round delivered (red 7550a442, fix a6328140) but NOT merged: above 20 finished runs every run adds +128 Drive calls (37 → 165; re-verifies every kept chain); no engine.ts change. Lead asked. c2-create-by-id round dispatched.
- Retention round 2 dispatched (bounded: stamp at done, Bin ≤3 oldest per run, ≤+3 calls past 20, golden variant with 25 runs).
- c2-create-by-id round 3 merged (red da4624ed, fix 700ce9f9; 4xx releases the id with "Your change was made, but Bower couldn't make a note of it."; pile note keyed by pile id; check green). Open: a background flush only logs a refused line (lead asked). P4-37c check dispatched.
- Background-refused journal line → side panel "what failed" once (lead); follow-up round after P4-37c.
- P4-37c BLOCK (c2-create-by-id round 3): a 429/403 rate limit is classed permanent and the line dropped (journal.ts:46); a refused rule/request/answer says "Your change was made"; start/online flushes only log; the pile-note retry fence uses the version just read and overwrites an edit made between tries (drive-vault.ts:1092). Round 4 on bower-escalated with the background "what failed" ruling.
- Retention round 2 blocked on numbers (C04 76→78 through the fence, 25-run variant +7); options (a)–(d) to the lead. Not merged.
- Retention (a) ruled (main 5733eb8): pin C04 78 and 25-runs 85; mechanical golden round, then review, then merge.
- spine-operations-checkpoints closed again (cebd0800, P4-38 PASS; retention wired; C04 78). 422/427. c2-create-by-id round 4 delivered; merging next.
- c2-create-by-id round 4 merged (red 14983272, fix 9b8bf954; rate limit keeps the id; honest refusal sentences; background refusal in what failed; pile-note fence on the last confirmed version; check green). Open: phone has no side panel, so a background refusal is desktop-only (lead asked). P4-37d check dispatched.
- Rulings main e1c4a22: phone "what failed" in the side sheet; retention covers every terminal run (spine-operations-checkpoints reopened). One round (escalated: it bins) after P4-37d. 421/427.
- P4-37d BLOCK (create-by-id round 4): quota/daily-limit/408 treated as refused (line lost); refused move/rename has no applied path; failed-in-memory survives sign-out when storage refuses. Round 5 (escalated, app) and retention terminal-runs round (escalated, runner) dispatched in parallel.
- Lead (main ea058a7): one Drive failure table in the transport (retry / wait-for-the-person / permanent); forwarded to round 5.
- Retention terminal-run round merged (red 21806fbf, fix fdea3310; check green). Open: runs failed by the Worker stale deadline never stamped (no runner); failure path +11 calls in the fake (stale listing pages). P4-38b check dispatched.
- Retention ruling (main 38f0370): unstamped folders over 24 h old count as terminal; failure path reuses the listing if P4-38b confirms +11. Round after P4-38b.
- P4-38b PASS (retention terminal); real runner pays +7 on the failure path (re-walk), so ruling 2 applies. Round 4 of retention dispatched (24 h rule, failure path reuses the listing, P4-38b minors).
- c2-create-by-id round 5 merged (red 3e0f19fe, fix 2992ce6e; one Drive failure table; prod -80; phone what-failed on the Bower tab; check green). Deviations asked: authError=wait, notFound=retry. runner/src/drive.ts:359 classification left for after the retention round. P4-37e check dispatched.
- Retention round 4 merged (red 2d6e4480, fix d1711a0a; 24 h rule; failure path 59→40 calls; prod -29; check green). P4-38c and P4-37e checks dispatched.
- Table deviations accepted with bounds (404 once then permanent); runner drive.ts:359 joins the table in a round 6 after P4-37e.
- P4-38c BLOCK (retention round 4): the 24 h rule can bin a person-made folder in .bower/runs (no run-id or Bower mark check, records.ts:101). Lead asked: (a) bowerRun stamped at create, (b) run-id name shape.
- P4-37e PASS (create round 5). Round 6 dispatched: 404 once then permanent, 401 wait after refresh, runner drive.ts:359 onto the table, plus the P4-37e minors (panel turn focus, request resend makes a second line).
- Retention round 5 merged (red a7a59d7c, fix 74ff0aa0; bowerRun at create; only marked folders binned; prod -24; check green). P4-38d check dispatched.
- spine-operations-checkpoints closed (retention complete, P4-38d PASS). 422/427. Waiting: c2-create-by-id round 6, then the stage 2 suites.
- Retention round 6 (lead): skip run folders holding unmarked items; spine-operations-checkpoints reopened; escalated round dispatched (it bins). 421/427.
- Retention round 6 blocked: the runner listing has no children of other run folders and Bower records carry no mark; options A (stamp records at create + list ≤3 candidates) / C to the lead.
- c2-create-by-id round 6 merged (red aa756edd, fix 9ad453a9/82efcbfc; 404 once then permanent; 401 wait after refresh; runner on the one table; panel focus; one request one line; prod -52; check green on the second run, dependency-rules-timeout logged). P4-37f check dispatched.
- Retention round 6 merged (red 831cc251, fix 5d54a7ea; records carry bowerRun; ≤3 candidates listed; 25-run golden 88; check green). Left out: a person moving an item in between the child listing and the Bin (Drive has no conditional trash). P4-38e check dispatched.
- c2-create-by-id closed (P4-37f PASS). 422/427. Waiting: P4-38e (retention round 6), then the stage 2 suites.
- spine-operations-checkpoints closed (P4-38e PASS). Process slip: the P4-38e reviewer checked out a commit in the main repo (restored, nothing lost); reviewer packets tightened. 423/427. Stage 2 entries all closed: suites next.
- Stage 2 suites green at be7a4094 (check: api 232, runner 228, harness 423/427; e2e 226; e2e:fake 257; pwa 4). jscpd 22 clones (= baseline). Production net since 9265d860: +3779/-2975 = +804. main moved to c9d20a67 (docs-only beyond be7a4094) and backed up (remote verified c9d20a67). Note: the staging origin URL sits in LEAD.md and the P3-21 packet since before 9265d860 (already in backup history).
- Stage 2 smoke blocked: browser pane reopened signed out (owner must sign A in; lead told). c3-reservation-home packet drafted (docs/harness/2026-10-09-c3-reservation-home-packet.md): reservation written twice (journal own intent map + raw generateIds), not dispatched.
- Stage 2 smoke on c9d20a67: 129 unstamped pile records binned; garden PASS 55 s, offer-and-flat PASS 81 s, c05-hub-lines PASS 72 s (report-misses-hub-line logged, Minor); Home empty Inbox 4.1 s / 15 calls (was 59 s / 144), no .bower growth. c3-integrate-gate delivered (754c5276/cea01d57); c3-reservation-home P4-39 BLOCK (rule test passes a renamed map) → fix round running.
- c3-reservation-home closed (e66f2b1d; P4-39 BLOCK, fix round, P4-39b PASS second way? no; prod journal +8/-2 on top of +103/-64). reservation-rule-test-slow logged (rule test hit 5 s under load; c3-test-time class). 425/430. c3-test-time running; c3-reviewer-guard next.
- Guard hook wired by owner (main 91b3b3f7); checked from a throwaway subagent: main-checkout git checkout blocked, coordinator git status runs. c3-test-time and c3-unused-code running.
- Addendum 6 (main 7f5fa754): slow ratchet uses alone times; ESLint rule on the primitive; c3-test-time fix round running. Registered c3-unused-production (Sonnet, next free slot) and p4-rate-limits (escalated, after stage 3). c3-reservation-upload (escalated) running. 427/434.
- Addendum 7 (main e451eb84): c3-reservation-upload fix round queued (4xx releases the record id through the keeper port); P4-40 PASS withdrawn until its re-review. Order: integrate c3-test-time, then upload.
- c3-test-time fix round delivered (red 70dd907c, fix 62bb8258; slow list 8, alone times). integrate.sh refused once: 'runner data errors unreadable runner data is explained on screen' 1039 ms alone while c3-unused-production ran its check (borderline, compute-bound). Rerun when that worker ends; then upload fix round.
- Closed c3-integrate-history (44378369) and c3-reservation-upload (5870a7cd, P4-40b PASS). 431/436. Dispatched c3-retention-race and c3-reservation-worker (both escalated). Next: c3-reply-schema, c3-subject, c3-planner-split, c3-note-sections, c3-pair-ask, c3-state-mark, c3-fingerprint.
- Addendum 21 (main 43a0289a): c3-fingerprint round 2 queued (JCS, golden regenerated, raw-input golden). Running: c3-reply-schema, c3-subject.
- P4-44 BLOCK (c3-reply-schema: structured_output branch untested; CLI give-up skips retry) → fix round per addendum 22 (read/write bounds, --json-schema off) running. c3-subject fix round (rule to ESLint) running. c3-fingerprint round 2 queued.
- Addendum 10 (main 56dd8d86): c3-timer-gate fix round (shared check lock) running; c3-test-time/c3-alone-margin to be re-proved after it. c4-test-timers registered. c3-planner-split running. Lead near send pause: questions go to LEAD_QUESTIONS.md if sends stop.
- Lead at 9 sends without an owner message: questions go to docs/harness/LEAD_QUESTIONS.md; answers come through DECISIONS on main (check after each main merge). Addendum 24 confirms live rule wording. P4-45 (planner-split part 1) running.
- c3-planner-split part 1 merged (3ad08b03, P4-45 PASS); part 2 dispatched (escalated, /private/tmp/bower-c3-plan2). Next after it: c3-note-sections, c3-pair-ask, c3-state-mark.
- P4-45b BLOCK (planner-split part 2: grounded() lost multiplicity checks: a dropped line row, a dropped set-aside row, a duplicated filed row pass) → fix round running. c3-branch-cleanup running. Unmerged list in docs/harness/2026-10-09-unmerged-branches.md (owner -D decision via lead).
- TL-P4-19 add. 3: 57 superseded branches deleted with -D (tips recorded in harness/deleted-branches.txt, local, excluded), corpuspdf worktree removed (its 16 untracked fragments copied to the coordinator scratchpad), c1-dupgate removed. 39 branches, 8 worktrees left. c3-branch-cleanup closed (5dda3a7f, after fix round for harness-git-cli-on-import). 440/448.
- c3-planner-split part 2 merged (a7c2ee04, P4-45c PASS, net -381); part 3 dispatched (split, op-id wire field, last capture tie).
- Addendum 4 (main 49fb0270): op id + line accepted as the ordinal among the op's own lines; part 3's line is 'counted from the end of the Timeline' (a note position) → change in the P4-45d fix round. P4-45d running.
- c3-planner-split part 3 fix round blocked: line ordinal has no anchor in the note (no per-line op); lead asked (options 1-4). No worker running.
- Planner-split smoke prep: four suites green at b9c2674d (check: app 3858, api 234, runner 236, harness 441/449; e2e 226; e2e:fake 257; pwa 4). main moved to a0a0c1a7 (docs-only beyond b9c2674d) and backed up (remote verified a0a0c1a7). SHA sent to the lead for deploy.
- Planner-split smoke on staging a0a0c1a7: garden PASS 51 s, offer-and-flat PASS 61 s, c05-hub-lines PASS 55 s; rows per Timeline line and New marks correct; Home 4.5 s / 15 calls, no .bower growth. c3-note-sections delivered (red 650f1ac3, fix 8233a111).
- c3-pair-ask dispatched (escalated, packet with ruling sweep). c3-state-mark (with write-it-silent, addendum 7) registered; dispatched after pair-ask (both touch scripted.ts and questions).
- TL-P4-18 addendum 2 (main f6856abd): UI-touching questions/defects are flagged as UI in messages to the lead (lead consults the designer). c3-pair-ask copy may change before merge (lead sends final text).
- 2026-10-10 Batch suites on claude/p3 6f9a38d2 (folder-header-wrap, c5-codex-run, p4-corpus-answers, shell-page-column, c5-test-margin, the C06/C07/C11 preps): pnpm check green; e2e 288 passed; e2e:fake 336 passed; e2e:pwa 4 passed (console-guard ✘ rows are its expected failures).
- 2026-10-10 evening: B11 and B4 preps accepted (TL-P4-48) and integrated. Reds committed: B1c (bed662ad + repair 9b8a4f69), B3b (511968f2 + repair 0b816ced), B5a (2af99057); implementations queued behind the srs/Q1a file handoffs. c05-timeline-list closed (aec27050, P4-95 PASS), 505/515. smoke-request-slow: red repairs 1–3 per lead rulings (pending/<run id>, own-run chain read, hand restores are a v1 limit), implementation running. B7, B8, B9 preps running.
