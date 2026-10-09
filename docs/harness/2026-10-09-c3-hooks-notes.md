# c3-hooks notes

Sources (code.claude.com/docs/en/hooks): exit 2 blocks PreToolUse, SubagentStop, Stop and PreCompact; any other
code (1) is non-blocking. A `Stop` hook in subagent frontmatter runs as `SubagentStop`. SessionStart matchers are
`startup|resume|clear|compact|fork`. `if` runs only on tool events, so no `if` was added. `CLAUDE_PROJECT_DIR` stays at
the session root even in a worktree; the input `cwd` is the worktree. The docs page I could read does not document
`stop_hook_active` for SubagentStop; the gate honours it anyway (it is documented for Stop).

Design: `scripts/check-mark.mjs` runs `pnpm check` and on green writes HEAD to `git rev-parse --git-path bower-check-green`
(inside the worktree's git dir, untracked). `scripts/stop-gate.mjs` exits 2 with one line unless the tree is clean and the
mark equals HEAD. Workers must run `node scripts/check-mark.mjs > log 2>&1` instead of plain `pnpm check` at the end.
`scripts/check-hook-scripts.mjs` (called by check-harness) fails on a missing hook script path.
Guard denial changed from JSON deny at exit 0 to stderr and exit 2.

tests changed: src/guard-main-checkout.test.ts: a denial now exits 2 with the reason on stderr, not JSON on stdout at exit 0
tests changed: src/docs.test.ts: SessionStart matcher is now `compact|resume`; the test checks it includes compact
tests changed: src/harness.test.ts: the scratch harness copies check-hook-scripts.mjs, which check-harness now imports

Left out: WORKER.md still tells workers to run plain `pnpm check` (not owned here); the STOPPED way out is proposed on the card.

## Addendum: Stop gate dropped (TL-P4-20 addendum 3)

Removed: the `hooks: Stop` block from `.claude/agents/bower-implementer.md` and `bower-escalated.md`; `scripts/stop-gate.mjs`,
`scripts/check-mark.mjs` and `scripts/mark-path.mjs` (nothing else imported them). Moves to c3-stop-gate.
Also removed with them, because they test only the removed gate: the two stop-gate tests and the check-wrapper test
("the check wrapper writes the mark only on green"), and "both implementer agents carry the stop gate".
The stop-gate `stop(repo())` line inside "a hook denial exits 2" is removed; the denial assertion stays.

tests changed: src/hooks.test.ts: stop-gate tests move to c3-stop-gate
tests changed: src/hooks.test.ts: check-wrapper and implementer-Stop-block tests removed with their scripts (move to c3-stop-gate)
