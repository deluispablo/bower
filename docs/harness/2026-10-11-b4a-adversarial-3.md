# B4a adversarial pass 3 (Astra xhigh, attempt 12, after fix round 2)

1. **Blocking: data safety** — [observations.ts:118](/private/tmp/bower-b4a-contract/src/data/contracts/observations.ts:118): Forget “Alex grows beans.”, then replay the same source/text with fresh IDs/hash in `about-working-on` instead of `about-preferences`. The replay becomes live, and a manifest displaying it validates. Pass 2’s cross-section resurrection remains reproducible.

2. **Blocking: hard rule** — [run-manifest.ts:820](/private/tmp/bower-b4a-contract/src/data/contracts/run-manifest.ts:820): With an ownership/2 About me and an empty ledger, initialize the three empty About regions followed by a marked `profile` containing “Alex prefers invented work.” Both manifest validation and admission accept this extra region without evidence.

3. **Blocking: normal use** — [run-manifest.ts:831](/private/tmp/bower-b4a-contract/src/data/contracts/run-manifest.ts:831): Start with initialized empty sections and admit one new preference. A correctly fenced, evidence-bound edit adding it returns `{ok:false, reason:"shape"}`, even with its archive. Every ordinary update is treated as consolidation, preventing the promised immediate write-through below the budget/count gate.

4. **Blocking: normal use** — [observations.ts:119](/private/tmp/bower-b4a-contract/src/data/contracts/observations.ts:119): Observe fact A → Forget A → explicitly remember as B → Forget B → explicitly remember as C, using fresh words sources and runs. B succeeds, but C produces `live: []`: referencing B cannot satisfy A’s retained tombstone. Repeated remembering becomes impossible.

No second parser, writer or region mechanism found. Read-only production probes reproduced all four findings; 48 additional control assertions passed.

Not checked: full suites, e2e or B4b/B4c runtime wiring; the contract failures above remain.
verdict: BLOCK
