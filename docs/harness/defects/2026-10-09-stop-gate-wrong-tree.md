# Diagnosis: stop-gate-wrong-tree (2026-10-09)

Log line: `docs/harness/DEFECT_LOG.md:49` (claude/p3). Code: branch `c3-hooks` at `20a3a908`, worktree `/private/tmp/bower-c3-hooks`.
Diagnoser: read-only. I ran only `vitest run src/hooks.test.ts` (8/8 pass) and a `node -e` call of `quietGate()`. Tags: **[docs]** quotes the docs, **[seen]** I checked it on this machine, **[inferred]** I reasoned it and did not observe it.

## What failed

`scripts/stop-gate.mjs:12` judges the tree at the hook input `cwd`:
`const cwd = typeof event?.cwd === 'string' ? event.cwd : process.cwd();`
`dirty(cwd)` (`:14`), `markPath(cwd)` (`:17`) and `head(cwd)` (`:21`) all run there. For a worker, that `cwd` is the main checkout, not the worker's worktree.

- **[docs]** sub-agents, "Working directory": a subagent starts in the main conversation's working directory. Inside a subagent, `cd` does not persist between Bash calls. Only `isolation: worktree` gives a subagent its own checkout.
- **[docs]** hooks, common input fields: `cwd` is the "Current working directory when the hook is invoked". The note "`cwd` follows Claude … the worktree root after Claude enters a worktree" covers a session that *enters* a worktree (`--worktree`, `EnterWorktree`). It does not cover a subagent that `cd`s on each command.
- **[docs]** the SubagentStop example shows `cwd` as `"/Users/..."`. No sentence defines `cwd` for a non-isolated subagent.
- **[seen]** The c3-hooks implementer's transcript is `…/19ca090d-…/subagents/agent-a56be65601944f1ad.jsonl`. All 80 of its entries record `"cwd":"/Users/deluisp/Projects/bower-app"`. All 16 of its Bash calls start with `cd /private/tmp/bower-c3-hooks &&`. Its system prompt says "Agent threads always have their cwd reset between bash calls".
- **[seen]** Across all 419 subagent transcripts there are 66,106 entries, and none records a `/private/tmp` cwd. 289 of those transcripts `cd /private/tmp/bower-*`. The cwd stays what it was at spawn. One subagent spawned while the parent was in `api/` kept `…/bower-app/api` throughout.
- **[seen]** The coordinator's transcripts show "Shell cwd was reset to /Users/deluisp/Projects/bower-app" 860 + 773 + 220 times. So the main conversation sits at the main checkout whenever it spawns a worker.
- **[inferred, not observed live]** The SubagentStop hook input `cwd` for a worker is `/Users/deluisp/Projects/bower-app`. The transcript `cwd` and the hook `cwd` come from the same session state, but no hook input was captured. The coordinator's planned "fresh worker run" after merge would confirm it.

**Q2: which tree is judged, and what the worker sees.** The gate judges the main checkout. Its mark is `.git/bower-check-green`, which does not exist **[seen]**. A worker's own mark is `.git/worktrees/<name>/bower-check-green` **[seen]**.
- **First stop:**
  - If the main checkout is clean, the worker gets "No green check on this commit: run `node scripts/check-mark.mjs …`" (`stop-gate.mjs:21`).
  - If the coordinator has uncommitted edits in main, the worker gets "The tree is not clean: commit your work (or remove stray files)" (`:14`), about files it does not own. `guard-main-checkout.mjs:9` blocks only checkout, switch, reset, rebase, merge and stash. `git add`, `git commit`, `git clean` and `rm` in main are not blocked. Risk to the coordinator's work **[inferred]**.
- **The worker's reaction [inferred]:** it reruns the full `pnpm check` through `check-mark.mjs`, which costs minutes and tokens. If it runs the command bare, as the message says, the command runs in main. It then runs `pnpm check` in main without `with-lock.sh` (`check-mark.mjs:11`, compare `integrate.sh:25`) and writes main's mark. From then on, every worker passes its first stop without any check while main stays at that HEAD.
- **Second stop:** `stop_hook_active` is true ([docs] "true when Claude Code is already continuing as a result of a stop hook"), so `:11` returns null. The worker stops whatever state its own tree is in. Its tree is never judged.

**Q3: does the input name the worktree? [docs]** No. SubagentStop receives these fields: the common fields (`session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode`, `effort`, `hook_event_name`), plus `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `background_tasks` and `session_crons`. `transcript_path` is the main session's transcript. Two fields hold the path only indirectly, as prose, and neither is a documented field for it:
- `agent_transcript_path`: the subagent's transcript holds the dispatch prompt ("Worktree: …") and the `cd` commands. The docs warn that transcripts may lag.
- `last_assistant_message`: the card. Its `commits:` line is free text; the c3-hooks card wrote "red a695ad3b; fix 1345dd13; notes (HEAD…)".

**Q4: the WORKER.md gap [seen].** Three places tell workers to run plain `pnpm check`: `WORKER.md:9`, `WORKER.md:39` and `.agents/skills/bower-implement/SKILL.md:8`. The gate accepts only a mark written by `check-mark.mjs`. The c3-hooks notes leave this out ("not owned here"). The result is two commands for one gate. A worker that obeys WORKER.md runs `pnpm check` twice, and nothing in the docs tells it to use the mark wrapper.

## Why (5 whys)

1. **Why is the wrong tree judged?** The gate reads `event.cwd`.
2. **Why is `event.cwd` the main checkout?** Workers are plain subagents. They reach their worktree only through a per-command `cd`, which never changes the session cwd.
3. **Why did c3-hooks assume `cwd` is the worktree?** Two reasons. The hooks docs' worktree note, quoted in `c3-hooks-notes.md`, describes a session that enters a worktree. And the tests feed the fixture repo as `cwd` (`src/hooks.test.ts:29-36`, `:103`), a value the live hook never receives. So the red/green passed on a model of the input that does not happen.
4. **Why could no test or review catch it?** The packet (`c3-hooks-packet.md`, Contract 1) says "the worker's tree" but not how a hook learns which tree that is. No harness record ties a running worker to its worktree in a form Claude Code or a hook can read.
5. **Design cause.** The worker-to-worktree binding lives only in prose: the dispatch prompt and the `cd` on each command (`COORDINATION.md:60-65`). It has no home that tools can read. TL-P4-20 ruled out Claude Code's own binding (`isolation: worktree`), so every tool that needs "the worker's tree" has to guess.

## Owner mechanism

None in the mechanism map, which has no harness or hooks row. The de facto home of the gate is `scripts/stop-gate.mjs` with `scripts/mark-path.mjs` (TL-P4-20 row 2, `c3-hooks`). The worker-to-worktree binding has no home: the manual `git worktree add` in `COORDINATION.md:65` plus the dispatch prompt.

## Same class elsewhere: 4 places (tools that need the worker's tree, from a cwd that is not it)

- `scripts/quiet-gates.mjs:10,16`: `SHELL` rejects `&&`, so a worker's `cd <wt> && pnpm check` is never made quiet **[seen: `quietGate()` returns null]**. 418 worker gate commands began with `cd`. `WORKER.md:9` says "a hook does this for a plain gate command", which never holds for a worker.
- `scripts/check-mark.mjs:9` uses `process.cwd()`, which is right only after a `cd`. The gate's own messages tell the worker to run it bare (`stop-gate.mjs:14,21,24`), which runs it in main.
- `scripts/stop-gate.mjs:12` falls back to `process.cwd()`, the hook process's cwd. Unverified, probably main.
- `src/hooks.test.ts:29-36,103`: the fixtures use a worker-tree `cwd`, which encodes the wrong model. The `guard-main-checkout` test at `:103` covers a cwd that never occurs for these workers. The guard itself (`guard-main-checkout.mjs:21-26`) has the right model: it starts from `cwd` and follows each `cd`.

## Options (for the lead; no design chosen)

- **(a) Fix inside the gate.** The gate finds the worker's tree from fields it does get, not from `cwd`. One way: the card's commit SHA, then `git worktree list --porcelain` from main, then the worktree whose HEAD is that SHA. Another: the dispatch prompt's `Worktree:` line in `agent_transcript_path`.
  - Size: S (about 30 lines plus fixture tests).
  - Risk: medium. It parses prose; the card's `commits:` is free text and the transcript can lag. A card with `blocked` or `stalled` and no commit must be let through. `check-mark` must still run inside the worktree, and WORKER.md still needs changing.
  - Leaves open: the second stop still passes anything (`stop_hook_active`). [docs] An 8-in-a-row continuation cap already exists, so honouring the flag every time is a choice the lead can make, not something the docs require.
- **(b) Refactor first, then fix.** Make one gate command and one tree source.
  - (1) Fold the mark into `pnpm check`: its last step writes the mark, and `check-mark.mjs` goes. WORKER.md and SKILL.md stay correct, and the two-command split ends.
  - (2) Give the worker's gate command one shape that `quiet-gates` recognises, for example `pnpm --dir <wt> check`. Today `GATE` at `:7` matches neither `cd` nor `--dir`.
  - (3) Make one strict card field the tree source, read by both the gate and the coordinator.
  - Then fix the gate as in (a).
  - Size: M. Risk: low to medium. `pnpm check` in `integrate.sh` and `done.sh` would also write main's mark, which is harmless once the gate stops reading main. It touches `WORKER.md`, `package.json`, `quiet-gates.mjs` and the gate.
- **(c) A new mechanism, only as a replacement.** Use Claude Code's own binding: `isolation: worktree` on the implementer agents. [docs] Under it, Bash runs in the worktree, `cwd` follows, and Claude Code itself blocks a cwd or git redirect into main.
  - TL-P4-20 rejected it because it "branches from the default branch". [docs] `worktree.baseRef: "head"` now branches from the local HEAD, but that HEAD is not a pinned SHA. A `WorktreeCreate` hook (input: `name` only) could run the harness's own creation step.
  - It is acceptable only if it **replaces** the manual `git worktree add` (`COORDINATION.md:65`) and is reconciled with `integrate.sh` cleanup. Two points to reconcile:
    - Claude Code locks the worktree while the agent runs, sweeps old worktrees and names branches `worktree-<name>`.
    - Codex workers keep manual worktrees, which leaves two lifecycles unless the lead accepts that split.
  - Size: L. Risk: high. It reverses a TL-P4-20 "not adopted" ruling, so it needs the lead and possibly the owner.

## Class regression test

Every hook or script that acts on "the worker's tree" is tested with the hook input a worker really gets. The fixture: `cwd` = a "main" repo, and the worker's worktree is a linked worktree elsewhere. Cases:
1. Main clean and marked green, worker dirty: exit 2.
2. Main dirty, worker clean with a mark at its HEAD: exit 0.
3. Main marked, worker unmarked: exit 2.
4. The worker's real gate command form is made quiet by `quiet-gates`.

Plus one live check after merge, the "fresh worker run" from the packet: record the SubagentStop input `cwd` and the tree that was judged. That is the only proof of the [inferred] point above.
