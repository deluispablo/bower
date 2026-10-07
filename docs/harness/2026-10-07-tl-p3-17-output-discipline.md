# Technical-lead decision TL-P3-2026-10-07-17: no text for a reader nobody is

**Owner instruction, 2026-10-07:** limit the output of the coordinator and its workers as far as possible without hurting their performance. The owner talks only to the lead and does not read the other sessions. Communication between the sessions must stay good.

## Why it pays

The coordinator's ledger row up to batch 5 cost about $581 in API-equivalent terms:
- cache reads, 52%;
- cache writes, 28%;
- output, 20%.

Visible text is only part of the output, so cutting it saves a little directly. The larger saving is indirect. Every line a session writes, and every worker report it receives, stays in its context and is read again on every later turn ([Claude Code costs](https://code.claude.com/docs/en/costs)). Expected effect: roughly 8–15% of the coordinator's cost and 2–5% of a worker's. It is measured, not assumed (below).

## Rules

1. **The coordinator writes no text for a reader.** There is no narration between tool calls, and the end of a turn is at most one line (`waiting: <what>`). A desktop "user hasn't heard from you" reminder gets one line too. Its communication goes to the lead as cross-session messages, and to workers as packets.
2. **Communication between the sessions stays complete.** Messages to the lead have at most 10 lines. They give facts, SHAs and file paths, and number each question with a draft answer. A packet keeps its full acceptance contract, but points to files instead of pasting them. Brevity never drops a fact the reader needs to decide: a missing fact costs a re-read, which costs more than the line saved.
3. **Workers write no text between tool calls.** Their final reply is a fixed card of `key: value` lines, defined in [WORKER.md](WORKER.md):
   - implementer, at most 8 lines;
   - review, 12;
   - evaluation, 12;
   - mechanical, 5.
   Details live in files the card points to, read only when needed. The cards are set in the agent definitions, the configuration that loads every time, as well as in the skills.
4. **Thinking is untouched.** Effort stays as configured, because reasoning is where performance comes from. Only text meant for a reader is cut.

## Measured

- **The coordinator:** its `ccusage` row per batch (TL-P2-44 rule 8). Output tokens and cache reads per batch are compared over the three batches before and the three after, and logged in [token-baseline.md](token-baseline.md).
- **Workers:** the ledger, per role.
- **Escalation:** if a card turns out too thin, so that the coordinator has to re-read files to decide, the lead adds the missing key rather than lifting the cap.
