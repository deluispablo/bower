**smoke-request-slow — adversarial review, pass 3 (scoped)**

Verdict: **PASS**  
Range: `7877a456..9142d472`

Blocking findings: **none**.

- `src/data/vault/vault-index.ts:81`: after B appends but relocation fails, `bowerRun=B` overrides containment in `pending/A`. The next tidy-up sees B’s completion.
- `runner/test/c05-bounded-reads.test.ts:615`: the pinned red reproduces that failure with identical and changed wording, asserting no second append, completion, effect or update.
- `src/data/spine/scripted.ts:193`: interruption after pointer publication but before the append retains the binding when read-back proves the write did not land; the red at test line 621 covers recovery.
- **Second mechanism: no.** Journal capture, runner context and history use `waitingRun()`. Publication uses ordinary moves; successful relocation clears the pointer. History reads only the selected run’s verified records.
- **Red loosened nothing.** `efa23e3f` adds coverage only; the fix leaves its tests unchanged.

Minor / v1 limits:

- Tests were not executed during this read-only review; runtime green is not independently confirmed.
