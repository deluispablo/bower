# Technical-lead decision TL-P3-2026-10-07-29: the output rule survives compaction

**Owner observation, 2026-10-07:** after the manual compactions, the coordinator writes a lot again, and the workers likely do too.

**What the transcript shows.** The coordinator session has been compacted four times. Its last 60 text blocks average about 280 characters, some reach 1,600, and it narrates between tool calls. Workers still use the card format, but each card runs 1,800–3,300 characters instead of 8 short lines.

**Why.** [TL-P3-17](2026-10-07-tl-p3-17-output-discipline.md) lived in the coordinator brief, which the coordinator reads "once per session", and in the worker card, which worker prompts may paraphrase. A compaction keeps only a summary of what was read, while project instructions (`CLAUDE.md`, which imports `AGENTS.md`) are loaded again into every session and subagent ([Claude Code memory](https://code.claude.com/docs/en/memory)). A rule meant to hold after compaction belongs there. This is the same lesson as TL-P2-44: enforce rules through what loads every time, not through prose that is read once.

**Ruling.**
- **`AGENTS.md`, Start here, gains one output line.** Only the lead talks to the owner. The coordinator and workers write no text between tool calls, a coordinator turn ends with one line, and a worker reply is its card with each line under 120 characters. Messages between sessions stay complete, at most 10 lines.
- **`WORKER.md` caps card lines at 120 characters:** SHAs, test names and paths, never explanations.
- **Measured** as TL-P3-17 says. If the coordinator still narrates after its next compaction, the next step is a `SessionStart` hook with the `compact` matcher that re-injects the brief's output lines ([hooks](https://code.claude.com/docs/en/hooks)).
