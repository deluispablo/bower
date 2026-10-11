**Q1c live questions — adversarial pass 2 (scoped)**  
Verdict: **PASS**  
Range: `754ca743..a8cbc49e`

No Blocking finding remains.

- `runner/src/status.ts:73`: sorts numerically by askedAt, then takes ten before validation; excess count alone cannot abort clear work.
- `runner/src/main.ts:228`: retains all durable askings; Drive precedence remains unchanged.
- `api/src/runner.ts:113`, `api/src/security.ts:90`: malformed cards and requests above 64 KiB remain refused.
- `runner/test/q1c-live.test.ts:148`: exercises a crash before checkpoints/effects, then recovery through main; stored actions survive and public options exclude actions.
- `api/test/q1-questions.test.ts:137`: two otherwise valid options isolate action rejection.
- `runner/test/q1c-live.test.ts:136`: repairs incorrect file-based identities while preserving counts, clear-work assertions and the ten-card cut.

**Minor / v1 limits**

- `runner/test/q1c-live.test.ts:137`: all eleven askings share askedAt; the fixture proves tie order and truncation but would pass without sorting. Unsorted distinct timestamps lack coverage.

No second mechanism introduced. Static review only; tests were not rerun. No files changed; no network used.
