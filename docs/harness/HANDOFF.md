# Handoff: where the work stands and what comes next

For an agent starting a new session with no memory of the last one. Read `AGENTS.md`, `docs/harness/METHOD.md` and `docs/PHASES.md` (all four phases) first; this file is the state of play and the plan. Keep it true: when a step below is done, say so here and in `harness/progress.md` (`## Next`) in the same commit.

Historical phase snapshot below: 2026-10-05, at commit `9dabc23`. Startup/coordination instructions updated on 2026-10-05; current completion counts and next work come from `harness/features.json`, `harness/progress.md` and the current integration `ACTIVE.md`, not the historical counts below. The owner speaks Spanish in chat; everything in the repo is English.

## Resumed handoff: 2026-10-05

Coordinator `p2-orchestrator-2026-10-05-01a10bbd` is explicitly appointed by the owner. Adopted planning revision: `2026-10-05-contracts-2` from main `d12c55e`. PRODUCT, ARCHITECTURE, WORK_PLAN, P2_ACCEPTANCE and GOVERNANCE govern current scope; ORCHESTRATOR_START O1–O8 governs assignments. Historical counts and later-phase deferrals below do not supersede full acceptance or bounded P2-R requirements. Preserve the following final-round evidence as history.

Current delivery: **209/214**. Session-folder-isolation is independently reviewed and proof-closed at20864d4, source44ee162; detailed final checkpoint below supersedes the historical assignment stages. Journal acknowledgement `7869489`, pile structural prechecks `afb4b36`, context version `f9f0bf7`, local run ordering `7f49572` and legacy task byte preservation `af90266` are independently reviewed and proof-closed. Foreground discovery `64d5e3d` is also reviewed/closed. Request preflight `16ab28c` is reviewed/closed. Latest integrated production source is `cb73061`; check481/seventeen request cases passed. These narrow proofs do not complete the full capability rows.

Leading-dot source `28d2ce2` and revised Timeline `6305ca9` remain integrated-open. Prior source28d2ce2 full demo/fake suites each had196 passed/56 intentional skips. Final combined gates/manual are pending. Earlier Chrome evaluation at `d086d6c` was NOT RUN; evidence remains retained. Coordinator later recovered IAB control with a real about:blank tab creation/closure. No app evaluation is claimed from that diagnostic. The independent replay plan and synthetic byte/hash fixtures are retained for a later frozen production build.

The sole isolated worker is now assigned session-folder-isolation on base7c48f4d, branch codex/p2-session-isolation. Initial live.test.ts-only red has seven genuine failures/two compatibility passes; reserved six-file production scope follows the independent prerequisite. All seven foundation candidates have independent reports and actual closure proofs. Combined e15 review/check/demo is complete: one Important baseline account isolation defect was actually reproduced and registered. Final fake/PWA/native were not started; independent read-only prerequisite comes before the sole worker assignment. A corrected target needs fresh full gates/review. The independent evaluator has no browser in its own session and reports a locked Mac; owner availability query is pending. Root supplemental IAB checks, if performed, are separate from an independent live-evaluation certificate. No worker browser grant or second writer.

O1 maps four missing/twelve partial full capability rows; all real R1–R4 probes are NOT RUN. Owner offline/upload-reload policies and authorized synthetic provider resources, plus the lead's protected-format decision, remain pending. Incomplete readiness/report recovery and broader O4–O7 work require accepted dependent contracts. P2 acceptance is open; no main product merge, push, deployment or P3/P4 work.

## Previous stable handoff: 2026-10-05

The owner requested a stable clean stopping point and another session to orchestrate/distribute remaining P2 and later work. Branch `codex/close-phase-2`, last frozen reviewed target `4d98eb0`; production fixes committed, no merge or push. **201/205 entries pass**, four qa-12 findings open. This supersedes the historical closure sequence/counts below; a new coordinator must establish its assignments in ACTIVE.md.

Final inspection found main independently advanced to `d12c55e` (planning revision `2026-10-05-contracts-2`). At that stopping point the planning commits were not integrated. The resumed coordinator now adopts/reconciles PRODUCT, ARCHITECTURE, WORK_PLAN, P2_ACCEPTANCE and ORCHESTRATOR_START before assigning work. Its complete simulated P2 contract supersedes historical scope below; the four findings here are not the complete acceptance backlog.

Read `2026-10-05-phase-2-final-round.md`: fresh whole-code review found two Important (journal acknowledgment without content validation; pile edits bypassing name/place concurrency) and one Minor (hidden dot-prefixed creation). Incomplete evaluator reproduced dot creation and Timeline source label mismatch. Regression names are registered but those new tests/fixes are not implemented. Resume the explicit remaining evaluator matrix after fixing, obtain fresh affected review and final check/demo/fake/PWA gates. Owner scope/phase closure agreement is still pending. Do not call P2 complete.

## Session startup and skills

Both tools follow `STARTUP.md`, load `bower-session` and only their assigned role skill, then check actual required tools. Canonical skills live in `.agents/skills/`; committed relative Claude links live in `.claude/skills/`. See `SKILLS.md` for researched optional Codex skills and their availability; use direct file loading if native discovery is missing. Read-only review/evaluation does not run init or rebuild its target. Native discovery/routing needs a fresh-session check; no new implementation batch is assigned by this update.

## Where things stand

- **Phase 1** (the UI on demo data): done.
- **Phase 2** (app logic over Google Drive and the Worker, with a pretend Drive and Worker behind `?source=fake`): built, then hardened by rounds of evaluation and review. It is **not closed yet**: the owner's rule is no next phase until a round comes back clean.
- **Rounds so far** (each round's findings became entries in `harness/features.json` with that `task`):

  | Round | Source | Entries | State |
  | --- | --- | --- | --- |
  | qa-5 | evaluator | 48 | closed |
  | qa-6 | evaluator | 50 | closed |
  | qa-7 | reviewer of qa-6 | 17 | closed |
  | qa-8 | evaluator after qa-6 | 20 | closed |
  | qa-9 | reviewer of qa-7/8 (range `57ab04d^..4833d3c`) | 18 | closed |
  | qa-10 | evaluator after qa-8 | 18 | closed |

- **Harness:** 185/185 entries pass, each with a proof in `harness/proof.log`; one open entry was added with this handoff (`phone-more-faint`, below).
- **Last gates, all green at `9dabc23`:** `pnpm check`; the whole e2e suite on demo and on fake (186 passed, 52 skipped on each; the skips are tests for one screen size or one source only); `pnpm e2e:pwa` (4 passed).

## The plan, in order

1. **Close the one open entry**, `phone-more-faint`: the ⋯ (More) button on phone note pages is very faint. Test first, then `harness/done.sh`.
2. **Triage the deferred minors** in `docs/superpowers/plans/2026-10-04-phase-2-ledger.md` (the `Final: minor (deferred)` lines and the two `Ruling` lines that say "in phase 3"). Each one either becomes an entry in `features.json` (task `qa-11`, with `steps` and a `verify`) and gets fixed, or gets a written ruling the owner agrees to. Ask the owner which, in one short message, before deciding for them.
3. **Review round** (qa-11): a fresh reviewer over the range `4833d3c..HEAD`. See "How to run a round".
4. **Evaluator round** (qa-11 or qa-12): a fresh evaluator replays every qa-9/qa-10 bug and polish entry and explores the whole app. See "How to run a round".
5. **Fix every finding** as entries, one per commit, through `done.sh`. Then repeat 3 and 4 on what changed.
6. **Phase 2 is closed** when a reviewer and an evaluator both report nothing Critical or Important and the owner agrees. Write that in `progress.md` and here, and update `AGENTS.md` (phases line).
7. **Phase 3, the Worker** (Cloudflare Worker: sign-in, tokens, the run dispatch). Start with a requirements and design discussion with the owner (`superpowers:brainstorming` may be used if available), then a spec in `docs/specs/` and a plan in `docs/superpowers/plans/` (as phase 2 did), then a fresh feature list section in `features.json`. The contract is already written: `docs/specs/2026-10-04-worker-contract.md` (where the fake and the contract disagree, the contract wins). The real Worker must also honour what phase 2 added to the contract:
   - `POST /vault` answers `{ folderId, found }` (`found: true` when the person's earlier folder is still in their Drive, so the app says welcome back).
   - `DELETE /me` forgets the folder pointer too.
   - The runner (phase 4) writes `requests` and `rulesWorded` in the report, takes out rules a journal line `removes`, rewrites `[[links]]` after `rename`/`move` lines, and keeps one journal record per `id` (archiving every copy).
   - Phase 3 also owes a real-Drive smoke test (ledger: full-text tokenising, resumable-upload resume, rename and modifiedTime behaviour).
8. **Phase 4, the agent** (the runner on GitHub Actions in the operator's private instance repo). Not planned yet.

## How to run a round

Claude/Codex coordination follows `COORDINATION.md` and the current integration copy of `ACTIVE.md`. Use immutable base/target SHAs and assigned checkouts; the detailed protocol takes precedence over the historical tool-specific examples below. No active implementation batch is assigned by the methodology update.

Rounds are independent sessions with fresh context, either standalone Claude/Codex sessions or explicitly assigned subagents. The one who builds never grades.

- **Reviewer** (fresh capable session; read-only). Prompt: "Follow the brief in `harness/briefs/reviewer.md` exactly. Review the git range `<base-sha>..<target-sha>` in the assigned checkout." Add what to look at specifically: every entry of the round (does the fix do what its `what` says for a person, and would its named test fail without it?), harness honesty (can an entry pass without a real red then green?), and the new data paths of the range. Ask for Critical / Important / Minor with `file:line`, effect on a person and a fix, what it set aside and why, and a one-line verdict.
- **Evaluator** (general-purpose; uses the available dedicated browser automation). Prompt: "Follow the brief in `harness/briefs/evaluator.md` exactly." It uses the dev server on 5190 and the production build on 5192, uploads only synthetic fixtures from the assigned checkout, and must not edit files or run git. Part 1: replay every bug/polish entry of the last rounds by its `steps`, on fake and demo, desktop and phone (390×844). Part 2: a fresh exploratory pass as a first-time user and as a keyboard-only user.
- **Do not mutate the evaluator's checkout while it runs**: the dev server hot-reloads under it, and its report fills with reloads that are not bugs.
- **Findings become entries** in `features.json` (next `task` number), each with `what`, `steps` an evaluator can replay, and a `verify` naming the test that will pin it. Commit them in one `chore(harness): qa-N entries …` commit, update `## Next`, then fix them one per commit.
- **The reviewer and evaluator may run at the same time** when explicitly assigned the same immutable target and a frozen evaluator checkout. Browser suites and browser-based `done.sh` closures remain serialized across worktrees with the current port configuration. Fix the reviewer's harness findings first: they change how every later entry is closed.

## Closing entries: what the tools expect

- Stage the entry's change (`git add`), then `bash harness/done.sh <id> "<message>"`. It refuses anything unstaged (outside `harness/`), another entry's `passes` changing, a red that is not a failed assertion, and a verify whose test names do not all match real tests.
- `--fixed-in <sha>` when the fix is already committed; `--known-green "<why>"` only when the entry's `note` (committed before) says why there can be no red, e.g. a tests-only entry checked red by hand.
- Two entries fixed by one change: close the first normally, the second with `--fixed-in <sha of the first>`.
- A new module: commit a stub first, or the red is a load error, which `done.sh` refuses.
- Times on this Mac: a unit-test entry closes in about 3 minutes; an e2e entry in 10 to 15 (the red step and the verify each run Playwright on demo and on fake). Run long closes in the background and wait for the notification.

## Traps on this machine

- **Playwright needs the display awake.** Headless Chrome (system Chrome, `channel: 'chrome'`) stalls when the Mac's display sleeps: a test hangs for ~15 minutes, often with the boot screen still up, and Chrome logs `CVDisplayLinkCreateWithCGDisplay failed`. Check first: `system_profiler SPDisplaysDataType | grep "Display Asleep"` (no output means awake). If asleep, do unit-test work and ask the owner to wake it. `caffeinate`, GPU flags and `--global-timeout` do not help.
- **macOS has no `timeout` command.** A script that relies on it never runs what it wraps (a bisect "proved" a docs commit guilty this way).
- **Servers:** dev on 5190 and the build preview on 5192 (`.claude/launch.json`); Playwright starts its own dev server on 5191 (`reuseExistingServer`). The preview needs `pnpm build` to show new code.
- **Dates in tests:** never hard-code today's date (a journal test broke at midnight).
- **Shared state between component tests:** unmount (`cleanup()`) and reset the UI store in `afterEach`, or one test's dialog closes the next.
- **Prettier** reformats whole files; do not run it over a file you only touched in places.
- **Commands chained with `;`** go on after a failure; use `&&` around gates.

## Decisions taken in phase 2 (and where they are written)

- A move or rename checks name and place, not modifiedTime (`AGENTS.md`, ledger).
- The journal outbox stays at sign-out; it is keyed by folder (`AGENTS.md`, `src/data/device.ts`).
- The outbox asks Drive itself before sending a waiting line, one browser tab at a time (Web Locks); it takes no lock when nothing waits (`src/data/vault/journal.ts`).
- Links follow renames: the app finds notes by former names until the next tidy-up; the runner rewrites the links (`src/data/links.ts`, Worker contract).
- Rules are kept once and can be removed with Undo; removal is a journal line the runner applies (`src/data/rules.ts`, contract).
- Saved links are always `.url` files and are searched and opened by their address (`src/data/piles.ts`, `src/data/search-text.ts`).
- One name per thing everywhere: no extension, its kind beside it (`thingName`, `pileName`).
- Tabs and open folders belong to who is signed in; a situation opened by its address starts clean (`src/app/tabs-store.ts`, `src/clean-start.ts`).
- The boot screen length is the owner's choice and stays.
- The owner's GitHub links are the one personal-data exception (the landing is a portfolio).

## Open questions for the owner

- The `offline` situation shows "Bower opens when you're back online" for the whole app, although the production build's service worker could open notes the device already has. Offline reading is a product decision (phase 3 or later).
- Failed uploads are forgotten after a page reload (ledger ruling): a durable upload queue is a phase 3 decision.

## Memory outside the repo

Tool-private memory may point at this repository but is not required to start a session. Durable project requirements and preferences belong in the map/specs/handoff; assignments live in the integration record. Never depend on a Claude memory path being available to Codex or a Codex chat being visible to Claude.

## Current execution sequence

Audit C01–C16 and boundary contracts on the adopted immutable SHA; specify R1–R4 probes, reproduce foundations and repair the four qa-12 findings through independent review and done.sh. Accept compatible contracts before dependent vertical slices, preserve all second-brain capabilities and record persisted simulated effects. Finish preparation/corpus and frozen O8 acceptance. Offline-reading and upload-reload rulings remain pending; high-impact provider assumptions require observations before dependent acceptance. No P3/P4 implementation or phase acceptance is authorized. See live ACTIVE and progress Next.

## Resumed O1/O2 delivery

Read 2026-10-05-p2-o1-audit.md (143ae2b, four missing/twelve partial) and 2026-10-05-p2-r-probe-specs.md (all live probes NOT RUN). Five foundations are currently reproduced and registered qa-13 with planned verifies; four qa-12 remain pending. Journal candidate 244be68 has red/green/check (400) and is under independent review. Owner policy/resource questions are pending; do not infer answers. New schemas/slices wait on relevant real premises and technical-lead decisions; independent foundation repairs continue.

Journal delivery: candidate 244be68 independently reviewed, integration 7c95fd8, coordinator red/check/verify closure 7869489. Current 202/210; pile-edit-still-seen is the next sole-writer assignment. See live ACTIVE and retained journal review.

Pile structural delivery: candidate 929d95b, integration cecffca, closure afb4b36. Context-version removal/rename defect separately reproduced at afb4b36 and registered/assigned; current 203/211. Parser ownership ambiguity requires lead-defined compatible boundaries before implementation.

## Current combined-review delta

Combined e15d13c (source cb73061) passed check481/51 files and full demo198/56 intentional skips. Independent combined review exposed a baseline reused-Sources account/folder cache hazard, actually reproduced by root at143ae2b and e15 using public synthetic APIs. User/root switches to B; read/create/saved journal still target A. Registered session-folder-isolation, planned verify, count208/214. Evidence qa14. Real OAuth/UI and final fake/PWA/native at e15 NOT RUN; freeze ended cleanly, ports5191/5192 empty, no owned tab, dev5190 preserved.

Sole implementer idle/read-only; independent reviewer prepares small current-contract lifetime/pending-work prerequisite before root assigns exact base/files. Never discard durable/volatile folder outboxes or imply cancellation/rollback of already-dispatched Drive work. After the fix, use a new combined freeze for full gates/review/actual affected evaluation. Independent live evaluator has empty surfaces and locked Mac; availability question pending. O3/R resources/policies/protected grammar and broader capabilities still block P2 acceptance.

Account isolation first-stage red7/2 at unchanged base7c48f4d is retained qa14. Six-file production grant: live/index.ts, session.ts, runs.ts, live.test.ts, vault/drive-vault.ts, journal.ts. Read the current ACTIVE/prerequisite before writes. Keep local lifetime separate from run tickets, subscriptions stable and all folder outboxes; reject stale continuations without late trash or B effects. No new wire/helper/UI/policy. Worker candidate/review/root inverse-fix closure and fresh combined gates/evaluation remain required.

Current six-file isolation production stage was explicitly dispatched after667a80b. Evaluator known root browser id2 also returned unavailable in that session; report retained under evaluation evidence, no UI activity. Root has no active browser/server grant. External5190/61369 is no longer observed by lsof; root never stopped it. Repeat ownership checks before preview/gates.

## Immutable isolation candidate and independent review

- Plan 2026-10-05-contracts-2; P2 C01/C14; entry session-folder-isolation. Sole worker returned clean, frozen candidate `8bd67cdd77e3b3f32459b3708eccdf7d8bb80c8b` on immutable base `7c48f4d71290415a79e5bdc0b9b073407190eaa0`, checkout /private/tmp/bower-p2-journal-ack, branch codex/p2-session-isolation. Exactly the six assigned files, unchanged public wire. Private lifetime-scoped vault/run instances behind stable sources/subscription bridges; original-owner journal retention and stale refusal, no cancellation/rollback promise.
- Test-first evidence: initial base red7/2, extended red25/5, final base red29/5. Exact named verify green34/50 excluded; worker pnpm check515/51 files green. Original run-order19, foreground16 and preflight17 expectations retained. One approved pre-existing fresh-session fixture adds sessionStorage.clear beside localStorage.clear; timing/phase assertions retained. Intermediate failures and final logs persisted qa14.
- Root reran both original public synthetic probes against exact candidate8bd67cd: exit0 each. After A→B, read B bytes, create/journal B and leave A unchanged. Late already-applied A effect now refuses stale success, retains A outbox and leaves B outbox empty. Separate corrected scripts' outputs/hashes retained; original red evidence unchanged. No OAuth/UI/provider/atomicity/full recovery certification.
- Independent reviewer /root/o1_audit assigned exact base→candidate, read-only Git/source/docs/supplied logs. Scope includes cached reads/storage/Undo, old auth/lifecycle/replies, queues, late effects/uploads, stable subscriptions/concrete capabilities and durable/volatile owner journals. No execution/build/browser/provider/edits/delegation/closure. Report /private/tmp/bower-session-isolation-review-8bd67cd.md. Important/Critical findings require same-entry correction and renewed review.
- Integration remains source cb73061, count208/214; candidate not integrated or closed. Root alone serially integrates after clean independent review and runs inverse-fix assertion red/check/verify. Then fresh combined gates and affected evaluation. No preview/tab/browser grant, second implementer, new contract/policy, main product merge or phase acceptance.

## Isolation candidate returned for disposal continuation

Independent source review of8bd67cd identified a pending cached listing/markSeen continuation after full Sources.dispose. Root reproduced through public synthetic methods: hold actual listAll reply, start refresh and markSeen on its pending index, dispose, release. Both promises resolve; local bower:seen changes from null to the synthetic file/version. Actual assertion fails; script, source hashes, outputs and raw log retained qa14. No account crossover/OAuth/UI/provider claim. This narrow lifecycle/storage finding stays inside session-folder-isolation; no new contract or entry.

Candidate8bd67cd is not integrated or closed. Same sole worker/base7c48f4d/checkout/branch/six-file ownership is explicitly authorized for test-first correction: new named assertion red against8bd67cd before production, smallest disposal guard repair, preserve earlier34 cases/old assertions and observed A bookkeeping. Preserve rejected8bd67cd locally, return one replacement immutable candidate covering the original entry range. Full independent report is finishing; renewed independent review and all root probes required before integration. Count208/214/source cb73061 unchanged, no browser grant.

## Replacement isolation candidate

Same assigned original base7c48f4d, six files, worker checkout/branch, C01/C14 and current contract: immutable replacement `2244218c60f25ffa5f8991a905f52eba9f460199`. Worker clean/read-only. Rejected8bd67cd preserved under codex/evidence-session-isolation-8bd67cd; independent changes-requested report retained qa14. New disposal red at8bd67cd: one genuine failure/35 compatibility passes/50 exclusions. Replacement named36/50 excluded and fullcheck517/51 files green. Existing no-effect disposed runs.current cached return remains supported with its old assertions; vault continuations refuse and already-issued create original-owner retention remains intact.

Root reran all three exact public synthetic probes at2244218: account switch, late observed effect and held-listing/markSeen disposal each exit0. The former disposal storage stays unchanged; original-owner outbox and B isolation remain correct. Separate outputs/source hashes retained. No browser/OAuth/provider/atomicity/reload guarantee.

Renewed independent /root/o1_audit review assigned originalbase→replacement and focused8bd67cd→replacement, same read-only restrictions; report /private/tmp/bower-session-isolation-review-2244218.md. Integration/proof pending, source cb73061/count208/214 unchanged. Root actual browser inventory still lists IAB2 and MCPApps1; no tab/navigation/evaluation happened. Independent evaluator remains unavailable, no equivalent certification inferred.

## Verified isolation delivery and remaining P2 checkpoint

- Plan contracts-2/main d12c55e unchanged. Renewed independent review of base7c48f4d→2244218 has no remaining actionable finding; report retained qa14. Three root public synthetic probes pass exact candidate; worker named36/fullcheck517 green. Prior rejected8bd67cd Minor disposal finding and genuine red1/35 remain retained, corrected without weakening old behavior.
- Coordinator serially integrated candidate as `44ee162abfeb77ec168d18b5e66cd24a43619915`, then proof-closed only session-folder-isolation as `20864d4`. done.sh --fixed-in44ee162 actually removed five production-file changes, observed an assertion red, restored them, passed pnpm check and unchanged named verify, then wrote proof. Closure raw log retained qa14. Count209/214. Latest integrated production source44ee162, no public wire/schema change. Full app/browser/provider gates remain unrun at this new target; no phase acceptance.
- Sole worker assignment complete/released, owned tmp checkout clean/read-only at2244218; previous candidates/evidence branches preserved. Root sole integration/shared-record writer, no second writer, browser/preview/tab reservation or active gate. Independent evaluator actual browser availability remains blocked. Root IAB inventory is available only for separately labeled supplemental evaluation; no app navigation took place in this delivery.
- Five registered entries remain open: integrated naming create-leading-dot28d2ce2 and timeline-source-names6305ca9 need current full gates and actual phone/desktop evidence before proof closure; partial-pile-readiness, protected-current-prose and run-report-save-barrier depend on accepted ownership/readiness/recovery contracts and relevant P2-R evidence. O1 four missing/twelve partial full capability obligations remain; eight bounded foundation proofs do not certify complete rows.
- Next: reserve a fresh target for full check/demo/fake/PWA and affected naming evaluation; retain independent live-evaluation NOT RUN until actual capabilities are available. Obtain lead protected ownership contract, owner offline/upload rulings and authorized synthetic provider resources/results; accept O3 compatibility before O4 recovery, O5 complete persisted semantic simulations/Undo, O6 preparation, O7 measured corpus and O8 owner dossier. P2 open; no main product merge, push, deployment, P3/P4 or owner acceptance.
