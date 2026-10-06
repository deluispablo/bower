# Technical-lead decision TL-P2-2026-10-06-41: token budget

> Amended by [TL-P2-44](2026-10-06-tl-p2-44-enforced-token-method.md): models are pinned by project agents, review is one cross-provider pass against the packet's acceptance contract, and a hook filters gate output.

**Owner ruling, 2026-10-06:** token use is too high, so the method must change to cut it as far as possible. The owner approved this proposal in full. It overrides METHOD, STARTUP, COORDINATION and TL-P2-38 wherever they differ.

## Where the tokens went (measured 2026-10-06)

- **Startup reading.** Each new agent read about 270 KB of documents before working, roughly 70k tokens: `HANDOFF` 54 KB, `progress.md` 53 KB, `ACTIVE` 43 KB, `COORDINATION` 21 KB, `WORK_PLAN` 17 KB, and more. Implementer, reviewer and delta reviewer each paid it on every entry.
- **Agents.** Many fresh agents per entry, each rediscovering the code. Up to four review rounds on one entry.
- **Model.** Opus for everything, mechanical gates and waiting included.
- **Sessions and messages.** Day-long coordinator and lead sessions, re-sent on every turn. Long cross-session messages, each landing in two contexts.
- **Output and records.** Full test output in context (3,400+ tests). `features.json` (200 KB) and 40 decision files read whole.

Sources: [Composio](https://composio.dev/blog/ways-to-cut-token-consumption-in-claude-code), [KDnuggets](https://www.kdnuggets.com/7-practical-ways-to-reduce-claude-code-token-usage), [TinyFish on subagents and forks](https://www.tinyfish.ai/blog/agentic-coding-context-vs-tokens-subagents), [Verdent](https://www.verdent.ai/guides/answers/reduce-token-costs-ai-coding), [Tian Pan on multi-turn agent cost](https://tianpan.co/blog/2026-04-20-token-economy-multi-turn-tool-use-agent-cost).

## Rules

1. **Read by role** (AGENTS "Start here").
   - Workers read `WORKER.md` (2 KB) and their packet only.
   - The coordinator reads `HANDOFF` and `ACTIVE`.
   - The lead reads `DECISIONS.md` and opens only the section it needs.
   - Nobody reads `features.json` whole (use `jq`), nor archives, history or old reviews, unless the task is about them.
2. **Small live records,** kept by the coordinator:
   - `HANDOFF.md` at most 5 KB, keeping the headings the docs test requires;
   - `ACTIVE.md` at most 3 KB, current assignments only;
   - `progress.md` only `## Next` plus the last 10 log lines.

   Everything older moves, byte for byte, into dated archive files that nobody reads by default.
3. **One-page packets.** Entry, goal, owned files, the test to write, the verify command, and the rule lines that apply, copied in. Never "read document X" when three lines will do.
4. **The cheapest capable model.**
   - Implementers and ordinary reviewers use **Sonnet**.
   - **Opus** is kept for contract design or review, data-safety findings and the lead or coordinator's own rulings.
   - **Haiku**, or a plain script with no agent, runs mechanical work: `done.sh`, gates, waiting for the display, reading logs, staging deploys.
   - Extended thinking stays low for simple edits.
5. **Fewer agents per entry.**
   - An ordinary entry: the implementer reviews its own diff against `WORKER.md`, and the coordinator spot-checks the diff and the gates.
   - An independent review only for contracts, data-safety changes and entries that touch shared persistence.
   - One batch review of the whole diff at the freeze.
   - A delta review only after a Critical finding.

   This replaces TL-P2-38's "one review and at most one delta" for ordinary entries.
6. **Output goes to files.** Every gate writes to a log file, and agents read only the failures or the last 20 lines. Targeted `vitest` runs during work; the full `pnpm check` once before delivery.
7. **Short messages.** Cross-session messages run 10 lines at most. Cite rulings by ID (TL-P2-xx) instead of restating them; the detail lives in the committed decision.
8. **Short sessions.** The coordinator and the lead compact or restart at each batch boundary, resuming from `HANDOFF`, `ACTIVE` and `DECISIONS`.
9. **Codex workers again from 2026-10-12.** They run on a separate quota, so use them for implementation when available, under the same packet rules.
