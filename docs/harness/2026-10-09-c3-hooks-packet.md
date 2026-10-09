# Packet: c3-hooks (stage 3, TL-P4-20)

- **Entry:** `c3-hooks` (harness, config). Worktree `/private/tmp/bower-c3-hooks`, branch `c3-hooks` from `claude/p3`.
- **Authorization:** the owner authorized the config changes in the coordinator's chat on 2026-10-09: `.claude/settings.json` (hooks and permissions), agent definitions and hook scripts.
- **Ruling sweep:**
  - [TL-P4-20](2026-10-09-tl-p4-20-method-refinement.md), table rows 2 and 3.
  - TL-P4-20 addenda 1 and 2.
  - TL-P4-17 entry 2 (`guard-main-checkout.mjs`).
  - TL-P4-06 (`harness/after-compact.md`).
- **Starting model:** `bower-implementer` (Sonnet).

## Contract

1. **A stop gate for implementers (row 2).**
   - A frontmatter `Stop` hook on `bower-implementer` and `bower-escalated`, which runs as `SubagentStop`, exits 2 unless the worker's tree is clean and a green `pnpm check` mark names the current HEAD.
   - A wrapper writes that mark on green. The mark lives outside tracked files.
   - The hook honours `stop_hook_active`, so it never loops. Its exit-2 message says what is missing, in one line.
   - A worker stopped by the coordinator (status STOPPED) needs a way out. Say on your card how it gets one; propose it, do not invent a bypass.
2. **The hook audit (row 3).**
   - Denials exit 2, never 1.
   - `guard-main-checkout.mjs` reads `cwd` from the hook input. It already does at :20; prove it with a test.
   - One handler per rule, with an `if` filter only where the docs confirm the field.
   - check-harness fails when a hook script path in settings or agent frontmatter does not exist.
   - SessionStart also fires on `resume`, with the same after-compact text.
   - A PreCompact hook that never blocks.
3. **Research:** the current Claude Code hooks docs (code.claude.com/docs/en/hooks: exit codes, `SubagentStop`, `stop_hook_active`, matchers, frontmatter hooks). Cite them. context7 queries name only the library and the topic.

## Red

`a worker cannot stop with a dirty tree or without a green check on its HEAD`: the hook script, fed a fixture hook input, has no gate today.

## Verify (exact names)

- `a worker cannot stop with a dirty tree or without a green check on its HEAD`
- `a stop hook already active lets the worker stop`
- `a hook denial exits 2`
- `every hook script named in settings exists`
- `the main-checkout guard uses the hook input cwd`
- `pnpm check` must be green. Name the test file(s) on your card.

## Commits and limits

- Commit order: the red (tests only), then the fix, then the notes file in its own commit, with `tests changed:` lines.
- Edit only `.claude/settings.json`, `.claude/agents/bower-implementer.md`, `.claude/agents/bower-escalated.md`, hook scripts under `scripts/` or `harness/`, and their tests.
- No permission rules here; they belong to c3-permissions.
- The coordinator merges, then checks the hooks live in a fresh worker run.

Reviewers are read-only. They never move the main checkout in any form.
