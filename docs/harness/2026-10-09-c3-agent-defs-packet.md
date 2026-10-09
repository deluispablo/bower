# Packet: c3-agent-defs (stage 3, TL-P4-20)

- **Entry:** `c3-agent-defs` (harness, config). Worktree `/private/tmp/bower-c3-agents`, branch `c3-agent-defs` from `claude/p3` (after c3-hooks merges).
- **Authorization:** the owner authorized the config changes in the coordinator's chat on 2026-10-09: `.claude/settings.json` (hooks and permissions), agent definitions and hook scripts.
- **Ruling sweep:**
  - [TL-P4-20](2026-10-09-tl-p4-20-method-refinement.md), table rows 5 and 6.
  - TL-P4-20 addendum 1: plugin agents are not project roles.
  - AGENTS: at most two workers at once.
- **Starting model:** `bower-implementer` (Sonnet).

## Contract

1. **Native caps (row 5),** each checked against the current docs (code.claude.com/docs/en/sub-agents and settings) and cited:
   - the subagent concurrency limit at 2, if a setting exists;
   - `maxTurns` on every worker agent;
   - no nested dispatch for workers (no `Agent` tool).
   - If a cap does not exist in the docs, say so on your card and leave it out. Do not invent one.
2. **Tool allowlists (row 6).** The read-only roles use `tools:` instead of `disallowedTools`: reviewer, evaluator, diagnoser, impact and design-checker.
   - Each list names the tools that role uses today.
   - Include the browser MCP tools for the evaluator and the design checker.
   - Include Write for the diagnoser and impact, for their notes.
3. **A check-harness sensor:**
   - every `.claude/agents/*.md` frontmatter parses;
   - every worker has `maxTurns`;
   - the read-only roles use `tools:`, with no Edit.
4. **Each changed role runs once** on a trivial fixture task, to confirm it still works. The coordinator does this after merge; you list the exact prompts in the notes.

## Red

`every worker agent has a turn cap and read-only roles list their tools`: it fails today.

## Verify (exact names)

- `every worker agent has a turn cap and read-only roles list their tools`
- `pnpm check` must be green. Name the test file(s) on your card.

## Commits and limits

- Commit order: the red (tests only), then the fix, then the notes file in its own commit, with `tests changed:` lines.
- Edit only `.claude/agents/*.md`, `.claude/settings.json` (the cap only), the sensor and its test.
- Keep the stop hooks from c3-hooks.

Reviewers are read-only. They never move the main checkout in any form.
