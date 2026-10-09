# Packet: c3-reviewer-guard (stage 3)

- **Entry:** `c3-reviewer-guard` (harness). Ruling: TL-P4-17 entry 2 ([doc](2026-10-09-tl-p4-17-stage-2-pattern-review.md)). Worktree `/private/tmp/bower-c3-guard`, branch `c3-reviewer-guard` from `claude/p3`.
- **Starting model:** `bower-implementer` (Sonnet).
- **Live evidence:** DEFECT_LOG `reviewer-checkout-main`. The P4-38e reviewer ran `git checkout d930f397` in `/Users/deluisp/Projects/bower-app`.

## Contract

- **Script.** `scripts/guard-main-checkout.mjs` is a PreToolUse Bash hook script in the shape of `scripts/quiet-gates.mjs` (stdin event JSON, an exported pure function, `main` only when run directly). It refuses `git checkout|switch|reset|rebase|merge|stash` that would act on the main checkout `/Users/deluisp/Projects/bower-app`, when the event comes from a subagent:
  - commands run with cwd there;
  - `git -C <main>` forms;
  - `cd <main> && git …` forms.
- **The refusal** is a `permissionDecision: "deny"`. Its reason points to `git show`, `git diff` or a scratch worktree.
- **First, research** which hook input field marks a subagent (for example `agent_id` or `agent_type`). Cite the Claude Code hooks reference (https://docs.claude.com/en/docs/claude-code/hooks). If no such field exists, the script takes an explicit flag instead (`--subagent`), meant for agent frontmatter hooks. Say which on the card.
- **Do not edit `.claude/settings.json`, `.claude/agents/*` or any Claude Code config.** Wiring the hook is the owner's step. Put the exact wiring snippet in the notes file and one line on the card.

## Red

A test feeds a reviewer's checkout event and expects a block. It fails today because the script is missing.

## Verify (exact, from features.json)

`pnpm exec vitest run src/guard-main-checkout.test.ts -t` with:
- "a subagent.s git checkout in the main checkout is refused"
- "the coordinator.s own git checkout in the main checkout is allowed"
- "a subagent.s git checkout in a scratch worktree is allowed"

Then `pnpm check` must be green.

## Checklist

- Match the path exactly, never as a substring: `/private/tmp/bower-app-x` is not the main checkout.
- Every printed message is backed by a test.
- The card names the exact tests and reports `removed: <lines>`.
- Reviewers: read-only, never `git checkout` in the main repo.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
