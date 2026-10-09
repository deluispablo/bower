# c3-agent-defs notes

Red `ceef07f7`, fix see card. Test: `every worker agent has a turn cap and read-only roles list their tools` in `src/agents.test.ts`. Sensor: `scripts/check-agent-defs.mjs`, run by `scripts/check-harness.mjs` (so by `pnpm check`).

## Sources (Claude Code docs)

- Subagent fields `tools`, `disallowedTools`, `maxTurns`; MCP server-level names (`mcp__<server>`) accepted in `tools`; `disallowedTools` applies first: https://code.claude.com/docs/en/sub-agents
- Without `Agent` in `tools` a subagent cannot spawn; a subagent with no `tools:` inherits `Agent`, so workers deny it with `disallowedTools: [Agent]` (same page).
- Concurrency cap exists: env `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20, Claude Code 2.1.217 or later), set in settings.json `env`: https://code.claude.com/docs/en/sub-agents ("Concurrent subagent limit"), https://code.claude.com/docs/en/agent-sdk/subagents
- At `maxTurns` the agent returns partial output (marked partial from 2.1.246), resumable.

## What changed

- `.claude/settings.json`: only a new `env` key, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: "2"`. Hooks and permissions untouched. It limits subagents spawned with the Agent tool; resumes can pass it.
- Workers (implementer 80, escalated 80, mechanical 40 turns): `maxTurns` and `disallowedTools: [Agent]`. They had no denylist before.
- Read-only roles now use `tools:` (the denylist is gone). All have `maxTurns` (my choice, not in the packet: the sensor requires one on every agent).
  - reviewer, 60: Read, Grep, Glob, Bash, Skill.
  - diagnoser, 60 and impact, 60: Read, Grep, Glob, Bash, Write.
  - evaluator, 100: Read, Grep, Glob, Bash, Skill, ToolSearch, `mcp__Claude_Browser`, `mcp__plugin_playwright_playwright`. No Write: its notes go through Bash, as before.
  - design-checker, 80: Read, Grep, Glob, Bash, ToolSearch, `mcp__Claude_Browser`, `mcp__plugin_playwright_playwright`.
- Not added: Stop gate (c3-stop-gate), a depth variable.
- Judgement calls for the coordinator: the turn counts are estimates; if a role hits its cap on a real task, raise it. Roles lose tools they did not use (TodoWrite, WebFetch, WebSearch, LSP, other MCP servers); add to `tools:` if a role needs one.

tests changed: src/harness.test.ts: the scratch fixture copies the scripts check-harness imports; it now also copies `check-agent-defs.mjs`, or the conflict-marker test cannot start check-harness.

## One-line prompts to run each changed role once (after merge, one at a time)

- bower-implementer: `In a scratch worktree off claude/p3, add an empty file docs/harness/scratch-implementer.txt containing one line, commit it, and reply with only the card.`
- bower-escalated: `Same fixture as bower-implementer: in a scratch worktree, create docs/harness/scratch-escalated.txt with one line, commit it, and reply with only the card.`
- bower-mechanical: `Run "pnpm lint" in a scratch worktree, redirect output to a file, and reply with its exit status and the last 3 lines.`
- bower-reviewer: `Review range ee761276..ee761276~1 against no packet: read WORKER.md, run git show --stat on the range, and reply with the review card (verdict only).`
- bower-evaluator: `Open the dev server page at ?source=demo with the browser pane, report the page title and write one line to /tmp/scratch-eval.md via Bash, then reply with the evaluation card.`
- bower-diagnoser: `Write docs/harness/defects/2026-10-09-scratch.md with a one-line "what failed" for a made-up defect, then reply with the card; the coordinator deletes the note.`
- bower-impact: `Write docs/harness/impact/2026-10-09-scratch.md with one section "Touches" naming src/app, then reply with the card; the coordinator deletes the note.`
- bower-design-checker: `Open ?source=demo in the browser pane and report one measured value (getBoundingClientRect of the first button) as a finding line.`

Each run passes if the role finishes without a "tool not available" or zero-tools error and returns its card.

## Addendum: research tools (coordinator check)

- Diagnoser, impact and reviewer now also list WebFetch, WebSearch, ToolSearch and `mcp__plugin_context7_context7`. The coordinator named the first three; I added the context7 server because ToolSearch cannot load a tool that is not in the allowlist.
- Evaluator and design-checker also list WebFetch and WebSearch.
- Server prefixes confirmed in https://code.claude.com/docs/en/sub-agents (Available tools): "Both fields accept MCP server-level patterns in addition to exact tool names: `mcp__<server>` or `mcp__<server>__*` grants or removes every tool from the named server." So `mcp__Claude_Browser` and `mcp__plugin_playwright_playwright` grant all of their tools.
- The sensor pins no tool names beyond the no-Edit and no-Agent rules, so it is unchanged.
