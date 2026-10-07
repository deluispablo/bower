# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

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
  - P3-20 has seven fix entries, packet `2026-10-07-p3-20-security-fixes-packet.md`. Order:
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
