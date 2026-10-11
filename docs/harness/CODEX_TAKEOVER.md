# Codex takeover: running the three role sessions in Codex

The owner asked on 2026-10-11 that the work can go on in Codex if Claude's quota runs out ([TL-P4-56](DECISIONS.md)). The owner opens the three role sessions in Codex: `Planificador` (lead), `Orquestador` (coordinator) and `Diseñador` (designer). Each one runs **the same method**. Only the mechanisms below change, and nothing else does: the rules in AGENTS.md, DECISIONS, the defect flow, the gates, integrate.sh, done.sh, the packets, the owner's OKs and the hard rules all stay as they are.

## Who reads what

A Codex session reads `AGENTS.md` on its own. Then:

| Role | Working directory and branch | Reads first | Brief |
| --- | --- | --- | --- |
| Lead `Planificador` | `/private/tmp/bower-tl-planning`, `claude/tl-planning` | `docs/harness/LEAD.md`, then the last 40 lines of `DECISIONS.md` | `harness/briefs/technical-lead.md` |
| Coordinator `Orquestador` | `/Users/deluisp/Projects/bower-app`, `claude/p3` (the main checkout) | `docs/harness/HANDOFF.md`, then `ACTIVE.md` | `harness/briefs/coordinator.md` |
| Designer `Diseñador` | `/private/tmp/bower-design`, `claude/design` | `docs/design/STATE.md` there | `harness/briefs/designer.md`, then `.agents/skills/bower-design/SKILL.md` |

The branch names keep their `claude/` prefix. They are names, not owners, and renaming them would break every record that cites them.

**Opening a Codex Desktop thread on the main checkout** keeps `claude/p3` checked out. On 2026-10-11 at 09:21, a new Codex Desktop thread in `/Users/deluisp/Projects/bower-app` switched the checkout to `main` about 40 seconds after it started. The coordinator moved it back, and nothing was lost. When the app offers a branch, pick the current one (`claude/p3`), never `main`, or open the thread in a worktree. Claude's guard hook does not run in Codex.

**A missing worktree.** macOS clears `/private/tmp` at boot. The branches live in the main repository, so nothing is lost. Run `git -C /Users/deluisp/Projects/bower-app worktree prune`, then `git -C /Users/deluisp/Projects/bower-app worktree add /private/tmp/bower-tl-planning claude/tl-planning` (or `bower-design claude/design`), then `pnpm -C <path> install --frozen-lockfile`.

## Claude mechanism → Codex mechanism

| Today (Claude) | In Codex |
| --- | --- |
| Cross-session messages (`SendMessage` to another session) | `codex queue --thread <session name> --message "<text>"`, with at most 10 lines, one combined message per event and the sender's role on the first line. Check the channel on first use with a one-line test message. **Fallback,** if `queue` does not reach the other session: the mailbox below. |
| The 10-sends pause and `LEAD_QUESTIONS.md` | There is no pause in Codex. `LEAD_QUESTIONS.md` (coordinator to lead) and DECISIONS (lead's answers) remain the written record of every question and ruling. |
| The lead's watchdog cron (TL-P4-46 addendum 1) | A Codex app **heartbeat automation** on the lead's thread, every 20 minutes. The owner creates it, using the prompt in the owner's takeover note. |
| Tracked background jobs that wake the coordinator | Run each Codex worker as `bash harness/codex-run.sh …` with output to `/tmp/codex-run/<entry>-<attempt>.*`. The coordinator's own heartbeat automation (every 20 minutes) reads the `.result` files and continues. A turn end still names what it waits on (`waiting on: <result files>` or `idle: waiting on <role> for <item>`). |
| The coordinator's job scripts | `harness/jobs/` (one line each in `harness/README.md`). Worktrees go under `${BOWER_WORKTREES:-/private/tmp}`. Prompts for jobs in flight are listed in HANDOFF. |
| Claude subagents (`.claude/agents/*.md`): implementer, reviewer, evaluator, mechanical, escalated, diagnoser, impact, design checker | A fresh `codex exec` through `harness/codex-run.sh` (`--role <name>`; `--sandbox read-only` for the reviewer, diagnoser, impact and design checker). The prompt starts with "Your role: follow `.claude/agents/<name>.md` (ignore its frontmatter)", then the packet. Each run is a new session, never a resumed one. |
| "A fresh Claude review" closes each entry (TL-P4-29) | A fresh Codex reviewer at `--effort high` that took no part in the entry, plus the adversarial pass that escalated entries already have. There is no second provider, so independence comes from a fresh session, and the gates are never relaxed. |
| The model ladder Haiku → Sonnet → Opus | TL-P4-57: `gpt-6.1-sol` at `medium` or `high`, and `gpt-6-astra` at `high` (escalated work, closing reviews) or `xhigh` (adversarial passes), all on the Fast tier. |
| Cap: 1 Claude + 4 Codex workers | 4 Codex workers, plus the three role sessions. |
| `.claude/skills/` | `.agents/skills/` is canonical, and Codex reads it. If a skill is not offered, read its `SKILL.md` directly. |
| Claude Code hooks (`.claude/settings.json`): quiet gates, guard-main-checkout, guard-push, after-compact | They do not run in Codex. Their rules bind by hand: no push except the backup of main (BACKUP.md), only the coordinator switches the main checkout's branch, and logs go to files. After a compaction or a restart, re-read the "Reads first" files. Codex hook support is a configuration change, and only the owner may make one. |
| The Claude in-app browser and `preview_start` | Codex's browser, or Playwright from the shell. The dev server is `pnpm dev` (port 5190), with `?source=demo` and `?source=fake`. |
| claude.ai Artifacts (the owner's canvas, the designer's mockups) | Codex cannot read them. The designer works from `docs/design/` (STATE.md, specs, reviews) and shows the owner mockups as local HTML files that use the real tokens. They live under `docs/design/mockups/` on `claude/design`, hold made-up data only, and are opened in the browser. |
| `npx ccusage session` | `harness/codex-run.sh` already writes each run's tokens to `harness/tokens.csv`. |
| Memory (`~/.claude/projects/…/memory/`) | Read-only reference: the staging origin and the owner's preferences. The owner's takeover note gives the path. Never copy the origin into the repo. |

## The mailbox (fallback channel)

The mailbox is the directory `/Users/deluisp/Projects/bower-mail/`, outside every repository. It holds one file per receiver: `to-lead.md`, `to-coordinator.md` and `to-designer.md`.
- A sender appends one block: `## <ISO time> from <role>`, followed by at most 10 lines.
- A receiver reads its file at the start of every turn and on every heartbeat. When it has handled the messages, it appends `handled up to <ISO time>`.
- Nothing personal and no secrets go in the mailbox, as in the repo.

## Owner rules that carry over

- **Minimal text output (TL-P4-58):** reports to the owner are 1–3 lines.
- **ponytail at full level (TL-P4-59):** always on for every session, and every worker prompt starts with "Use the ponytail skill (full)".
- **Automatic compaction at about 50% (TL-P4-60):** state files are current after every decision.
- **Codex models (TL-P4-57).**
- **Newer rules:** read the last 40 lines of DECISIONS.

## What does not change

- **Who talks to the owner.** Only the lead and the designer do, in Spanish, briefly, outcome first. The coordinator never asks the owner anything.
- **The order of work.** Every ruling is committed on `main` before anyone relies on it, and UI waits for the owner's OK through the designer (TL-P4-40).
- **The integration path.** Merges go only through `harness/integrate.sh`, and entries close only with `done.sh` proof.
- **Hard rules.** No session enters credentials or signs in. Production, `bower-api` and its KV are never touched. Paid plans go to the owner.
- **Live Claude on staging** (`BOWER_PROVIDER=claude` in `deluispablo/bower-home`) uses the owner's Claude subscription token. With Claude's quota spent, live runs fail too. Leave the variables unset, tell the owner that staging runs scripted, and hold the owner's live retest until Claude is back.

## Going back to Claude

When Claude returns, each Claude session first reads its own state files, which the Codex sessions kept current. Before the switch, the Codex sessions finish any running job and commit their state. Nothing else is needed: both providers share one repository, one method and the same files.
