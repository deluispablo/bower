# c3-reviewer-guard notes

Script: `scripts/guard-main-checkout.mjs`. Test: `src/guard-main-checkout.test.ts`.

## Subagent field (researched)
`agent_id` in the PreToolUse input: "Present only when the hook fires inside a subagent call"
(https://code.claude.com/docs/en/hooks, "When running with `--agent` or inside a subagent"). `agent_type` also
appears for a main session started with `--agent`, so it is not used. Fallback flag `--subagent` for agent frontmatter hooks.

## Behaviour
Denies (permissionDecision "deny", reason points to git show / git diff / scratch worktree) git checkout, switch,
reset, rebase, merge, stash when the effective directory is `/Users/deluisp/Projects/bower-app` or inside it:
event cwd, `git -C <path>`, `cd <path> && git ...` (chains split on && || ; | newline). Exact path or `<main>/` prefix,
so `/private/tmp/bower-app-x` is not main. Not covered: subshell/`$(...)`, `pushd`, env GIT_DIR.

## Wiring (owner step; not done here), .claude/settings.json
```json
{ "hooks": { "PreToolUse": [ { "matcher": "Bash",
  "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/guard-main-checkout.mjs\"" } ] } ] } }
```
The `agent_id` check makes it a no-op for the coordinator. Alternative: the same command with `--subagent` in
`.claude/agents/bower-reviewer.md` frontmatter `hooks:` (then it applies whenever that agent runs).
Note a hook run from the main checkout resolves `$CLAUDE_PROJECT_DIR` there; from a worktree it is the worktree.
