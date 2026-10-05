# How this project is built: the harness

Bower is built by AI agents working in sessions that forget everything between them. The harness is what lets them pick up the work and finish it well: files in the repository that carry the plan, the state and the checks, so no agent depends on memory. A human steers (decides what and why); agents execute (plan, build, check).

It follows two published methods:
- Anthropic, [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): a feature list, a progress log, an init script, one feature per session, and a feature counts as done only after it is tested as a person would use it.
- OpenAI, [Harness engineering](https://openai.com/index/harness-engineering/): `AGENTS.md` is a map, not a manual; `docs/` is the system of record; rules that matter are checked by machines (tests and lint whose failures say how to fix them), not by memory; the one who builds is not the one who judges.

Claude and Codex share this method. For simultaneous sessions, follow [the coordination protocol](COORDINATION.md) and read the current integration copy of [the batch record](ACTIVE.md). One writer per checkout, explicit entry assignments and one coordinator for shared records. Native task lists do not replace repository state.

Startup and capability selection are shared: [STARTUP.md](STARTUP.md) and [SKILLS.md](SKILLS.md). Load `bower-session` once, then only the assigned role skill. Skills guide work; existing gates still prove it.

## The parts

| Part | Where | What it is for |
| --- | --- | --- |
| Skills | `.agents/skills/` (Claude links in `.claude/skills/`) | Shared startup and conditional implement/review/evaluate entry points. |
| Map | `AGENTS.md` (loaded by `CLAUDE.md`) | The short list every agent reads first: where things are, the hard rules, the routine. |
| System of record | `docs/specs/`, `docs/superpowers/plans/`, `docs/harness/` | Why and what: specs, plans with their ledgers (rulings and deferred findings), this method. |
| Feature list | `harness/features.json` | Everything that must work or be fixed, each with how to check it and `passes`. The backlog of findings lives here too. |
| Coordination | `docs/harness/COORDINATION.md`, `docs/harness/ACTIVE.md` | Cross-tool assignments, ownership, worktrees and shared-resource reservations. |
| Progress log | `harness/progress.md` | One dated line per session or feature: what changed, what is next. |
| Init | `harness/init.sh` | Installs, runs every gate, prints the next feature. |
| Proofs | `harness/proof.log` | One line per closed entry, written by `harness/done.sh`: the hash of the `verify` that passed, and whether it was red first. `pnpm check` refuses an entry that passes without one. |
| Sensors | `pnpm check`, `pnpm e2e`, `pnpm e2e:fake`, `pnpm e2e:pwa`, `src/architecture.test.ts` | Machines that say when something is wrong, and how to fix it. |
| Briefs | `harness/briefs/` | What to hand a subagent: implementer, evaluator (tester), reviewer. |

## The feature list

Each entry in `harness/features.json`:

```json
{ "id": "tour-loop", "task": "qa-5", "category": "bug", "what": "…what a person sees…",
  "steps": ["…how to see it…"], "verify": "pnpm exec playwright test -g \"…\"", "passes": false }
```

- `category`: `feature`, `bug`, `polish` (copy, layout, accessibility) or `review` (from a code review).
- `steps`: how a person reaches it; an evaluator replays them.
- `verify`: the command that proves it. It names the test that pins it (`vitest -t "<name>"`, `playwright -g "<name>"`); `scripts/check-harness.mjs` refuses one that does not. Never edit `verify` to make it pass; fix the code. A `verify` changed after closing reopens the entry (its proof no longer matches).
- An entry is never removed. A finding that turns out wrong gets `"passes": true` and a `note` saying why.

## A session, in order

Steps 3–6 describe implementation. Reviewers/evaluators follow their assigned read-only brief after startup; documentation/planning follows the owner's stated scope.

1. Follow `STARTUP.md`: orient, establish assignment/ownership and check relevant capabilities; read the required startup docs once.
2. Assigned writers run `bash harness/init.sh` only with exclusive checkout use. Reviewers/evaluators use a prepared immutable target and do not install or run mutating gates. A failed baseline becomes an explicitly assigned repair; never take over another session's dirty work.
3. The coordinator assigns the first eligible entry with `"passes": false` (or the one the human named); workers take only their assigned entry. Check dependencies and file reservations first.
4. Write the test that shows it (it fails), make it pass, run the whole of `pnpm check`. For anything a person sees, run its e2e on `demo` and on `fake`.
5. Check it as a person would, in a browser, at phone and desktop size, when it touches a screen.
6. In single-writer mode, stage the entry's change (`git add`), then `bash harness/done.sh <id> "<commit message>"`. Only staged changes and `harness/` are committed; anything unstaged is refused. With the uncommitted code set aside (tests kept) the `verify` must fail with a failed test; then it runs `pnpm check` and the `verify`, and only then flips `passes`, logs the proof and commits. One entry per commit.
   - The fix is committed already: `--fixed-in <sha>` puts that commit's code back as it was before it and expects the same red.
   - No red is possible (a decision kept, a finding not reproduced): `--known-green "<why>"`, only for an entry whose `note` says why.
   - The red must be a failed assertion: a test file that fails to load (its new module set aside) does not count. For a new module, commit a stub of it first (exports that do nothing yet), then the failing test, then the fix.
   - Any other flag is refused. A verify must name its test (`-t "…"` / `-g "…"`) and, once closed, that name must match a real test.
   - Parallel workers commit a candidate without shared-record changes; the coordinator integrates and closes with `--fixed-in` as described in `COORDINATION.md`. A candidate is not completion.
7. Before stopping: your assigned work is committed, checks and blockers are reported honestly, the coordinator records the next step under `## Next` in `progress.md` (`pnpm check` refuses an empty one). Every finding entry carries `steps` an evaluator can replay.

## Roles

Either tool can hold any role. Prefer cross-tool review when available. Only one coordinator integrates candidates and writes shared records; no session may assign itself work already reserved by another. A reviewer can inspect an immutable commit while an implementer works in a separate checkout.

- **Coordinator**: one named session owns assignments, integration and shared records. Brief: `harness/briefs/coordinator.md`.
- **Planner** (with the human): turns a request into a spec and a plan; findings become entries in the feature list.
- **Implementer**: one entry at a time, test first. Brief: `harness/briefs/implementer.md`.
- **Evaluator**: a fresh agent that did not build it uses the app as a person would and tries to break it. Its findings go into the feature list. Brief: `harness/briefs/evaluator.md`.
- **Reviewer**: a fresh independent session with sufficient review capability reads the whole diff against the plan. Brief: `harness/briefs/reviewer.md`.

The builder never grades its own work: every phase ends with an evaluator round and a review, and the phase is not done while any entry is open (owner's rule: no next phase until this one is right).

## Rules machines check

- `src/architecture.test.ts`: screens (`src/features`, `src/app`, `src/ui`) never import a data source directly (demo, Drive, Worker, fake); only `src/data/sources.ts`, `provider.tsx`, `types.ts` and pure helpers. The failure says which import and what to use instead.
- The vault contract (`src/data/contract/`): every `VaultSource` behaves the same.
- `pnpm e2e` and `pnpm e2e:fake` run the same tests on two sources.
- Lint, strict types, unit tests, build: `pnpm check`.

When a rule keeps being broken by hand, turn it into a check here rather than a longer `AGENTS.md`.
