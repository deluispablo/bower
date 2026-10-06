# Technical-lead decision TL-P2-2026-10-06-44: the token method, enforced by configuration

**Owner request, 2026-10-06:** research how to cut agent token use and raise agent performance, apply the findings to the method, and record today's consumption against the projected one so later batches can be compared and the method refined. This amends [TL-P2-41](2026-10-06-tl-p2-41-token-budget.md) and [TL-P2-42](2026-10-06-tl-p2-42-model-ladder.md); where they disagree, this ruling wins.

## What the ledger showed

The 12 rows in `harness/tokens.csv` (2026-10-06) are all Opus, although TL-P2-41 asked for Sonnet workers. An entry cost about 636k tokens on average, 36% of it in review, and the implementer alone 290k–550k, so the 150k Sonnet budget of TL-P2-42 would have escalated almost every entry. Lead and coordinator sessions were not logged at all. The baseline and the targets live in [token-baseline.md](token-baseline.md).

The research behind this ruling found that cost depends less on what an agent writes than on how often a large context is rebuilt. A subagent never reads its parent's prompt cache, a cache write costs 1.25× input and a cache read 0.1× (5% on Opus), and the default cache lives 5 minutes, so a worker resumed after a review usually pays its whole context again ([prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [Claude Code costs](https://code.claude.com/docs/en/costs)). Rules written only in prose were not followed; Anthropic's guidance is to enforce them with hooks and configuration, which run every time ([hooks](https://code.claude.com/docs/en/hooks), [best practices](https://code.claude.com/docs/en/best-practices)).

## The rules

1. **The model is set by configuration, not by the packet's prose.** Claude workers are dispatched only as the project agents in `.claude/agents/`: `bower-implementer` (Sonnet), `bower-reviewer` (Sonnet), `bower-mechanical` (Haiku) and `bower-escalated` (Opus). The Agent call names the agent and sets no `model`, because a caller's `model` overrides the agent's ([subagents](https://code.claude.com/docs/en/sub-agents)). Codex workers run `codex exec --json` with `-c model_reasoning_effort=medium` unless the ladder says otherwise. A session never changes model or effort midway: the cache is lost, so a climb is always a new session.
2. **The ladder climbs in fresh sessions.** After a ladder trigger from TL-P2-42, a fresh session on the next rung gets the packet, a 10-line summary of the failed attempt and the failing evidence: for Claude, `bower-mechanical` → `bower-implementer` → `bower-escalated`; for Codex, effort `medium` → `high` → `xhigh`. Opus or `xhigh` stalling still goes to splitting or to the lead. Medium effort is the default because medium already reaches near-top coding scores at a fraction of the output tokens ([Aider leaderboard](https://aider.chat/docs/leaderboards/)).
3. **Budgets come from the ledger.** A role's budget is 1.5× the median of its last three rows on the same model. Until three Sonnet rows exist: Haiku 60k, Sonnet implementer 450k, Sonnet reviewer 200k. Passing the budget is a ladder trigger, not a reason to kill a run that is about to deliver.
4. **Every fix round is a fresh session.** A review finding goes to a new implementer session with the packet, the finding and the diff range; never resume a finished implementer after a review. The finished session's cache has expired and its history is the most expensive context in the batch.
5. **The packet carries an acceptance contract.** Before coding, the packet lists the named tests and the observable behaviours that make the entry done, and the files in scope. The implementer builds to it and the reviewer judges against it; nothing outside it can block. An underspecified task cost about 30% more tokens in a 2026 study ([arXiv 2608.25399](https://arxiv.org/abs/2608.25399)).
6. **One review, from the other provider.** Codex reviews Claude's diffs and a Claude `bower-reviewer` reviews Codex's, on the diff range and the contract only. Cross-provider review caught 6–12 points more real bugs than same-model review on 1,000 pull requests ([Greptile, 2026](https://greptile.com/blog/model-inversion)). Only Critical or Important findings against the contract block; Minor findings go to `P2_POLISH.md` and never create an entry. At most one delta review (TL-P2-38).
7. **Gate output is filtered by a hook.** The project `PreToolUse` hook `scripts/quiet-gates.mjs` (in `.claude/settings.json`, tested by `src/quiet-gates.test.ts`) rewrites Claude's `pnpm check`, `pnpm test`, `pnpm e2e*`, `vitest` and `playwright` commands so the full output goes to a log file and only the failures and the tail come back. Chained, piped or already redirected commands are left alone. Codex has no such hook, so its packets keep the `> log; tail` rule from [WORKER.md](WORKER.md). Masking old tool output halved agent cost at the same solve rate in a JetBrains study ([The Complexity Trap](https://arxiv.org/abs/2508.21433)).
8. **Measure what is billed.** The ledger gains columns (header below). Claude subagents report `subagent_tokens`, tool uses and duration when they return; Codex reports `turn.completed.usage` in `codex exec --json`. The lead and the coordinator each add one row per batch from `npx ccusage session` (input, cache write, cache read, output, cost). Compare at least three entries before and after a change, because one task varies about 2× between runs, and record the result in [token-baseline.md](token-baseline.md).

   ```
   entry,role,tool,model,effort,attempt,tokens,input,cache_write,cache_read,output,cost_usd,tool_uses,minutes,outcome,date
   ```

   Unknown fields stay empty; the existing rows are migrated with empty new fields.
9. **Long sessions stay short.** Amended by [TL-P2-45](2026-10-06-tl-p2-45-manual-compact.md): no session clears itself; the owner compacts the lead and the coordinator by hand. As an optional backstop the owner may start them with `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000`, so they compact at 200k tokens instead of near the 1M window ([model config](https://code.claude.com/docs/en/model-config)); this replaces the percentage override in TL-P2-43. Workers keep the default.

## Left out

- Moving `docs/harness/evidence/` and the dated documents out of `docs/harness/` would shrink what a search returns, but touches many links; it waits for the P2 close.
- OpenTelemetry export needs a collector; the ledger sources above are enough for now.
- Advisor-style consults (a cheap model asking Opus for a few hundred tokens of advice) have good published results but no tool support here yet; revisit when the Agent tool or the API offers it in Claude Code.

## Adoption

The coordinator adopts this at its next batch boundary: migrate the `tokens.csv` header, dispatch through the project agents, and delete its copy of `harness/token-baseline.md` (the lead keeps [token-baseline.md](token-baseline.md)).
