# Handoff: where the work stands and what comes next

For an agent starting a new session with no memory of the last one. Read `AGENTS.md`, `docs/harness/METHOD.md` and `docs/PHASES.md` (all four phases) first; this file is the state of play and the plan. Keep it true: when a step below is done, say so here and in `harness/progress.md` (`## Next`) in the same commit.

Historical phase snapshot below: 2026-10-05, at commit `9dabc23`. Startup/coordination instructions updated on 2026-10-05; current completion counts and next work come from `harness/features.json`, `harness/progress.md` and the current integration `ACTIVE.md`, not the historical counts below. The owner speaks Spanish in chat; everything in the repo is English.

## Resumed handoff: 2026-10-05

Coordinator `p2-orchestrator-2026-10-05-01a10bbd` is explicitly appointed by the owner. Adopted planning revision: `2026-10-05-contracts-2` from main `d12c55e`. PRODUCT, ARCHITECTURE, WORK_PLAN, P2_ACCEPTANCE and GOVERNANCE govern current scope; ORCHESTRATOR_START O1–O8 governs assignments. Historical counts and later-phase deferrals below do not supersede full acceptance or bounded P2-R requirements. Preserve the following final-round evidence as history.

Current delivery: **208/214**. Journal acknowledgement `7869489`, pile structural prechecks `afb4b36`, context version `f9f0bf7`, local run ordering `7f49572` and legacy task byte preservation `af90266` are independently reviewed and proof-closed. Foreground discovery `64d5e3d` is also reviewed/closed. Request preflight `16ab28c` is reviewed/closed. Latest integrated production source is `cb73061`; check481/seventeen request cases passed. These narrow proofs do not complete the full capability rows.

Leading-dot source `28d2ce2` and revised Timeline `6305ca9` remain integrated-open. Prior source28d2ce2 full demo/fake suites each had196 passed/56 intentional skips. Final combined gates/manual are pending. Earlier Chrome evaluation at `d086d6c` was NOT RUN; evidence remains retained. Coordinator later recovered IAB control with a real about:blank tab creation/closure. No app evaluation is claimed from that diagnostic. The independent replay plan and synthetic byte/hash fixtures are retained for a later frozen production build.

The sole isolated worker is now read-only/released after request preflight. All seven foundation candidates have independent reports and actual closure proofs. Combined e15 review/check/demo is complete: one Important baseline account isolation defect was actually reproduced and registered. Final fake/PWA/native were not started; independent read-only prerequisite comes before the sole worker assignment. A corrected target needs fresh full gates/review. The independent evaluator has no browser in its own session and reports a locked Mac; owner availability query is pending. Root supplemental IAB checks, if performed, are separate from an independent live-evaluation certificate. No worker browser grant or second writer.

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
