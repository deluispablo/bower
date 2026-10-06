# Technical-lead decision TL-P2-2026-10-06-42: token measurement and the model ladder

> Amended by [TL-P2-44](2026-10-06-tl-p2-44-enforced-token-method.md): the ledger gains billed-token columns, budgets come from the measured median, models are pinned by project agents, and every climb is a fresh session.

**Owner request, 2026-10-06:** measure what each task costs in tokens. Start each task on a low model when planning allows, and raise the model only when the task gets stuck, gets complicated or fails review. Always pre-analyse which starting model is optimal. This extends [TL-P2-41](2026-10-06-tl-p2-41-token-budget.md).

The approach is a standard **model cascade**: cheap models first, with escalation to stronger ones only when needed. This literature reports large cost savings at small quality loss ([FrugalGPT techniques](https://portkey.ai/docs/guides/whitepapers/optimizing-llm-costs/frugalgpt-techniques), [routing and cascading survey](https://arxiv.org/pdf/2603.04445)).

## 1. Measure every entry

- **Ledger.** The coordinator keeps `harness/tokens.csv`, one row per agent run:

  ```
  entry,role,model,attempt,tokens,outcome,date
  ```

  - `role` is one of implement, review, evaluate, mechanical or research.
  - `tokens` is the agent's own total, as reported when it finishes.
  - `outcome` is one of delivered, escalated, failed review or clean.
- **Per-entry total.** The closure note gives the entry's total from the ledger.
- **Session totals** for the coordinator and the lead come from local session logs, measured with [`ccusage`](https://npmjs.com/package/ccusage) (`npx ccusage session`). It counts model tokens only; it is not billing truth. The lead reports them per batch.

## 2. Pre-analysis: pick the starting rung

Each packet states its starting model and a one-line reason:

| Task kind | Start |
| --- | --- |
| Mechanical: `done.sh`, gates, log reading, staging deploy, waiting for the display | **Haiku**, or a plain script with no agent |
| Small, local: copy, a test fixture, a one-file fix with a clear failing test | **Haiku** |
| Ordinary entry: a feature or fix inside existing patterns, an ordinary review | **Sonnet** |
| Contract design or review, data-safety, concurrency or recovery logic, a fix after an escalation | **Opus** |

## 3. When to climb a rung

Haiku → Sonnet → Opus. Stay on the same packet, and pass a 10-line summary of the failed attempt, never the whole transcript. Climb when any of these happens:

- two failed attempts at red→green;
- the review returns Critical or Important twice;
- the agent says it is stuck or unsure;
- the agent passes its budget without delivering: 60k tokens on Haiku, 150k on Sonnet.

Opus is the top rung. If Opus also stalls, the coordinator splits the entry or brings it to the lead. Every climb is a ledger row, so later pre-analysis can learn which kinds of task need which model.

## 4. What it should save

Most of our ordinary entries (copy, journeys, fixes in existing patterns) should finish on Sonnet or Haiku, instead of Opus as before. Sonnet costs roughly 60% less than Opus, and Haiku much less again. A cheap attempt that fails is wasted, which is why the pre-analysis matters. The ledger shows within a batch or two whether the ladder pays off, and the starting rungs are tuned from it.
