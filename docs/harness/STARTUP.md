# Session startup for Claude and Codex

This is the shared entry sequence for every new or resumed Bower session. `AGENTS.md` always points here; `CLAUDE.md` imports that map. The startup requirement does not depend on a skill being selected automatically.

## Orient before acting

1. Resolve the assigned checkout root; inspect `pwd`, `git status --short`, branch, `git rev-parse HEAD`, `git worktree list` and `git log --oneline -15`. Preserve existing dirty work. Do not infer another session has stopped from an empty batch record.
2. Load `.agents/skills/bower-session/SKILL.md` once, or invoke `bower-session` if the host has discovered it. Read `METHOD.md` once per session, `docs/PHASES.md`, `HANDOFF.md`, the `## Next` of `harness/progress.md`, then the current integration copy of `ACTIVE.md` and the relevant sections of `COORDINATION.md`. On resume, refresh Git and assignment state; reread only documents changed since orientation.
3. Resolve authority from the owner's request and the assignment packet. A direct request to update documentation authorizes that scope; it does not appoint an integration coordinator for another session's implementation. A request to implement an entry needs checkout/file ownership established first. If ownership or integration path is unknown, continue useful read-only investigation and request the missing assignment before writing there.
4. Load the assigned role skill and brief only: implementer, reviewer or evaluator. Coordinators use `harness/briefs/coordinator.md` and load the implement skill only when implementing/integrating. Planning and documentation work loads the relevant maintained documents. Read the feature and relevant spec/plan sections; do not load every skill or entire historical ledger by default.
5. Check the actual session's capability catalog and local prerequisites. Record Git/shell and Node/pnpm availability when needed; browser automation and reserved server when evaluating; the installed documentation skill when researching OpenAI products. A mentioned skill/MCP/CLI is not evidence that it exists. Optional capabilities in `SKILLS.md` never become startup dependencies for unrelated work.
6. An assigned writer with exclusive use of its checkout runs `bash harness/init.sh` before implementation; it installs dependencies, runs `pnpm check` and prints status. An installer failure does not prove the checks failed: record both separately. Read-only reviewers and evaluators do not run init or create builds/test outputs in the target checkout; use a prepared frozen target and coordinator evidence. Do not install or run gates over someone else's active work. If prerequisites fail, report exact missing evidence and continue unaffected investigation.
7. Give the short startup report below, then proceed within the assigned scope. Coordinator records writer reservations and necessary capabilities in `ACTIVE.md` before implementation starts. Workers never edit that shared record.

## Startup report

```text
Role and scope: <assigned role, entry or documentation request>
Checkout / branch / SHA: <actual values>
Integration / assignment: <path and reservation, or unresolved>
Existing changes: <owned paths and paths left alone>
Skills loaded: bower-session + <role skill or none>
Required capabilities: <available / unavailable / not needed>
Baseline: <init and check result, or why not run for this role>
Next action: <concrete action within scope>
```

The report is orientation evidence, not a new approval step. Do not ask for confirmation of actions already authorized. If the session cannot discover a local skill, read its canonical SKILL.md directly and continue with the same protocol. If a required file is missing, report it and use the maintained method/brief as the fallback; do not invent an installation requirement for a task that already has adequate tools.

## Invocation and session refresh

Codex: `$bower-session`, followed by `$bower-implement`, `$bower-review` or `$bower-evaluate` as assigned. Claude Code: `/bower-session`, followed by the matching `/bower-…` command. Plain requests still follow startup through the map; command names are convenience entry points.

The canonical definitions are `.agents/skills/bower-*/SKILL.md`. `.claude/skills/bower-*` are relative directory links to them, committed with the project. No duplicated workflow bodies or tool-specific shell interpolation is used. Resolve document paths relative to the assigned checkout root, rather than a user's home directory or another worktree.

After this change, existing sessions must reread the map/startup and refresh their skill catalog. If discovery does not show the four project skills, start a fresh session and inspect the actual catalog. Direct file loading remains available. Committed skills and links travel with a worktree created from a revision that includes them; older worktrees need an explicit coordinator-directed update. Do not assume hot reload or run a new host process on the owner's behalf to test it.

There are no startup hooks or background commands here. Host discovery, model compliance and simultaneous cross-tool use still need a live session check; file validation alone cannot prove them. First-session acceptance: both tools find the four skills (or disclose direct loading), report the same assignment from the integration record, preserve other work, and choose only their relevant role instructions. Test writer/reviewer behavior against a real assigned candidate before claiming improved delivery time.
