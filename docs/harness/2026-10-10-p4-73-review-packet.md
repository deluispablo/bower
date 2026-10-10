# Packet: P4-73 review (c5-codex-run, written by Codex; TL-P4-31 ruling 4)

This review is read-only and fresh. Do not run e2e, start a server, call the claude or codex CLI, or run `harness/codex-run.sh` against a real worktree. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c5-codex-run`. You may run `pnpm exec vitest run src/codex-run.test.ts` in that worktree (it uses temp repos and a fake codex).

## What to review

- **Diff:** `git diff claude/p3...c5-codex-run`: `harness/codex-run.sh`, `scripts/scan-staged.mjs`, `src/codex-run.test.ts`, `harness/README.md`, the notes.
- **Packet:** `docs/harness/2026-10-10-c5-codex-run-packet.md`; ruling `docs/harness/2026-10-10-tl-p4-31-codex-throughput.md` ruling 4.

## Look hardest at

- **What it must never do:** any remote upload, merge, branch switch, or write in the main checkout other than appending the tokens row. Could any path (an argument, a plan entry, a crafted file name, a symlink) make it act outside the worktree, commit in the main checkout, or run a git subcommand that sends to a remote?
- **Refusals before the run:** the main checkout (including a path that resolves to it via symlink or trailing slash), a `codex/*` branch, a detached HEAD, a dirty tree (tracked and untracked).
- **Commit refusals:** guarded paths (`.claude/`, `.agents/`, `.githooks/`, `scripts/guard-*.mjs`, hook/agent checkers, `settings*.json`, `.env*`), secrets and addresses in added lines; that nothing is committed when one hits; the plan file never committed; an unlisted change or a listed unchanged path refused.
- **Quoting:** messages, paths with spaces, a plan with shell metacharacters.
- **Gates and result:** check and e2e under the lock with real exit codes; the result file's status values match the packet; the tokens row uses the existing column order.
- **Tests:** do they prove the behaviour, or only the happy path? Fast and hermetic?

Already run by the coordinator: pnpm check green on the branch.

## Reply

The review card from `docs/harness/WORKER.md` (PASS or BLOCK). Every line is under 120 characters.
