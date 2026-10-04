# How this project is built: the harness

Bower is built by AI agents working in sessions that forget everything between them. The harness is what lets them pick up the work and finish it well: files in the repository that carry the plan, the state and the checks, so no agent depends on memory. A human steers (decides what and why); agents execute (plan, build, check).

It follows two published methods:
- Anthropic, [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents): a feature list, a progress log, an init script, one feature per session, and a feature counts as done only after it is tested as a person would use it.
- OpenAI, [Harness engineering](https://openai.com/index/harness-engineering/): `AGENTS.md` is a map, not a manual; `docs/` is the system of record; rules that matter are checked by machines (tests and lint whose failures say how to fix them), not by memory; the one who builds is not the one who judges.

## The parts

| Part | Where | What it is for |
| --- | --- | --- |
| Map | `AGENTS.md` (loaded by `CLAUDE.md`) | The short list every agent reads first: where things are, the hard rules, the routine. |
| System of record | `docs/specs/`, `docs/superpowers/plans/`, `docs/harness/` | Why and what: specs, plans with their ledgers (rulings and deferred findings), this method. |
| Feature list | `harness/features.json` | Everything that must work or be fixed, each with how to check it and `passes`. The backlog of findings lives here too. |
| Progress log | `harness/progress.md` | One dated line per session or feature: what changed, what is next. |
| Init | `harness/init.sh` | Installs, runs every gate, prints the next feature. |
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
- `verify`: the command that proves it. It names the test that pins it. Never edit `verify` to make it pass; fix the code.
- An entry is never removed. A finding that turns out wrong gets `"passes": true` and a `note` saying why.

## A session, in order

1. `pwd`, then read `AGENTS.md`, the last lines of `harness/progress.md` and `git log --oneline -15`.
2. `bash harness/init.sh`. If a gate is red, fixing it is this session's first feature.
3. Take the first entry with `"passes": false` (or the one the human named).
4. Write the test that shows it (it fails), make it pass, run the whole of `pnpm check`. For anything a person sees, run its e2e on `demo` and on `fake`.
5. Check it as a person would, in a browser, at phone and desktop size, when it touches a screen.
6. `bash harness/done.sh <id> "<commit message>"`: it runs `pnpm check` and the entry's `verify`, and only then flips `passes`, logs the line and commits. One entry per commit.
7. Before stopping: the tree is clean, every gate green, the next step written in `progress.md`.

## Roles

- **Planner** (with the human): turns a request into a spec and a plan; findings become entries in the feature list.
- **Implementer**: one entry at a time, test first. Brief: `harness/briefs/implementer.md`.
- **Evaluator**: a fresh agent that did not build it uses the app as a person would and tries to break it. Its findings go into the feature list. Brief: `harness/briefs/evaluator.md`.
- **Reviewer**: a fresh agent on the most capable model reads the whole diff against the plan. Brief: `harness/briefs/reviewer.md`.

The builder never grades its own work: every phase ends with an evaluator round and a review, and the phase is not done while any entry is open (owner's rule: no next phase until this one is right).

## Rules machines check

- `src/architecture.test.ts`: screens (`src/features`, `src/app`, `src/ui`) never import a data source directly (demo, Drive, Worker, fake); only `src/data/sources.ts`, `provider.tsx`, `types.ts` and pure helpers. The failure says which import and what to use instead.
- The vault contract (`src/data/contract/`): every `VaultSource` behaves the same.
- `pnpm e2e` and `pnpm e2e:fake` run the same tests on two sources.
- Lint, strict types, unit tests, build: `pnpm check`.

When a rule keeps being broken by hand, turn it into a check here rather than a longer `AGENTS.md`.
