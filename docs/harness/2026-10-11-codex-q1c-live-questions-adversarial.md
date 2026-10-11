Q1c live questions — adversarial review  
Verdict: **BLOCK**  
Range: `6a48e482...754ca743`

**Blocking**

- `runner/src/status.ts:73`, called from `runner/src/main.ts:297`: eleven ordinary bounded questions abort the entire run before effects. The planner accepts and persists all eleven, then snapshot validation throws. Reproduced through `main` using in-memory adapters: ten questions plus one clear item finish `done` and file the clear item; eleven finish `failed`, publish no questions, and leave the clear item untouched. Bound question planning before persistence while preserving clear-item progress. Missing runner coverage: eleven waiting items plus a clear sibling.

**Minor / v1 limits**

- `api/test/q1-questions.test.ts:130`: the stored-action rejection fixture contains only one option. It already fails the two-option minimum, so it cannot independently prove action rejection. Use two otherwise valid options.
- `runner/test/q1c-live.test.ts:154`: recovery starts after a completed run. It does not exercise a crash between manifest persistence and effects, or recovery of stored option actions.

Other reviewed paths preserve snapshot replacement, revision/phaseAt behavior, existing fences, Drive precedence, journal suppression, and session isolation. No second channel, store, or polling loop found. Public projections exclude actions. V15 appends only the nullable column; shipped steps remain unchanged. The red repairs retain their original assertions and scenarios.

No files changed; no network used.
