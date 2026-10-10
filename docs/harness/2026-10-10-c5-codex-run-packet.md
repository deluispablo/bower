# Packet: c5-codex-run (TL-P4-31 ruling 4; Codex, harness, non-escalated)

- **Entry:** `c5-codex-run`. Worktree `/private/tmp/bower-c5-codex-run`, branch `c5-codex-run` from `claude/p3`.
- **Ruling:** [TL-P4-31](2026-10-10-tl-p4-31-codex-throughput.md) ruling 4. After this entry's review PASS the cap becomes 1 Claude plus 4 Codex.
- **Starting model:** Codex. Then a fresh Claude review.

## Contract

`harness/codex-run.sh <worktree> <prompt-file> --entry <id> [--role <role>] [--sandbox workspace-write|read-only] [--effort low|medium|high] [--e2e "<playwright args>"] [--attempt <n>]`

1. **Refuses before the run** (exit 2, one line saying why, nothing run):
   - a worktree that is the main checkout (`/Users/deluisp/Projects/bower-app`, or `BOWER_MAIN` when set), or not a git worktree;
   - a branch named `codex/*`, or a detached HEAD;
   - a dirty tree (tracked or untracked changes).
2. **Runs** `codex exec --json --sandbox <sandbox> -C <worktree> -c model_reasoning_effort=<effort> - < <prompt-file>`. The binary is `CODEX_BIN` when set (tests use a fake), else `codex`. The JSON stream goes to the result directory.
3. **Usage row:** from the last `turn.completed` `.usage`, appends one row to tokens.csv in the existing column order (`entry,role,tool,model,effort,attempt,tokens,input,cache_write,cache_read,output,...,outcome,date`; tool `codex`, tokens = input + output). The file is `BOWER_TOKENS` when set, else the main checkout's `harness/tokens.csv`. It never commits that file.
4. **Read-only runs** stop here: the result file holds the last agent message.
5. **Commits** (workspace-write): Codex may write a commit plan `.codex-commits.json` at the worktree root: `[{"message": "...", "files": ["..."]}]`, in order. The script commits each in order; every message gets the trailer line `implementer: codex`. The plan file itself is never committed. With no plan, one commit of every change with message `<entry>: codex delivery`. A change not listed in the plan, or a listed path not changed, is refused (exit 3, nothing committed).
6. **Refuses to commit** (exit 3, nothing committed) any change under `.claude/`, `.agents/`, `.githooks/`, `scripts/guard-*.mjs`, `scripts/check-hook-scripts.mjs`, `scripts/check-agent-defs.mjs`, any `settings*.json`, or `.env*`; and any added line that matches a secret or address pattern: private key blocks, `AKIA…`, `sk-…`/`ghp_…`/`github_pat_…`/`xox[bp]-…` tokens, `client_secret`, a `*.workers.dev` origin, or an email address other than `you@example.com` / `noreply@anthropic.com` / `*@example.com`. One home for that scan: a small `scripts/scan-staged.mjs` (pure function plus CLI), so the backup pre-check can reuse it later.
7. **Gates:** after committing, runs `bash harness/with-lock.sh pnpm check` in the worktree, then, when `--e2e` is given, `pnpm e2e <args>` and `pnpm e2e:fake <args>` (each already takes the lock). Each log goes to the result directory; the script reads only exit codes and the summary line.
8. **Result:** one file `/tmp/codex-run/<entry>-<attempt>.result` (dir overridable by `CODEX_RUN_DIR`), `key: value` lines: `status` (refused|codex-failed|committed|check-failed|e2e-failed|green|read-only), `branch`, `commits` (sha list), `tokens`, `check`, `e2e-demo`, `e2e-fake`, each log path, and the agent's last message (the card) after a `card:` line.
9. **Never** runs a git push, merge, checkout/switch of another branch, or anything in the main checkout except appending the tokens row. No network beyond what codex itself does.

## Red (tests first, `src/harness-git.test.ts` or a new `src/codex-run.test.ts`)

With a fake `CODEX_BIN` script that writes files and prints a JSON stream, in a temp repo with a worktree:
- refuses the main checkout, a `codex/*` branch, a dirty tree;
- refuses a delivery touching `.claude/settings.json`, and one adding a fake `ghp_` token or a non-example email (nothing committed);
- a two-commit plan gives two commits in order, each with `implementer: codex`, the plan file uncommitted;
- an unlisted changed file is refused;
- a tokens row is appended with the stream's usage;
- read-only mode commits nothing and writes the card;
- the result file names the status and the commit shas (stub `pnpm` via PATH so check is fast and its exit decides `check`).

The scanner's pure function gets its own unit cases (each pattern, and the allowed example addresses).

## Commits

1. The red tests. 2. The script and `scripts/scan-staged.mjs`. 3. The notes (`docs/harness/2026-10-10-c5-codex-run-notes.md`: what changed, the research citation, `removed:` lines, logs). A line in `harness/README.md` naming the script.
