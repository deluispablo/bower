# B4b adversarial pass 6 (Sol high, attempt 32)

card:
- **Blocking: data safety — [scripted.ts:887](/private/tmp/bower-b4b-observations/src/data/spine/scripted.ts:887).** State: sole live `fact-new` was explicitly remembered after forgetting an identical `fact-old`. Input: “Forget my remote preference”; reply: `{factId:"fact-new",quote:"remote preference"}`. Both historical facts match, so direct Forget correctly declines—but clarification rejects the single live option. Production `main` ends `done` with `nothingReady:true`, no question, and the fact still remembered and visible. The request remains unconsumed. The same input without tombstoned history succeeds.

Pass-4 and pass-5 findings are closed. All 1,537 targeted in-memory checks passed, including frozen/legacy manifests and recovery. Second way: none found.

Skipped: full suites, `pnpm check`, and e2e. No files changed.

verdict: BLOCK
