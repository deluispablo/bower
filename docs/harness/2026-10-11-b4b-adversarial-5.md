# B4b adversarial pass 5 (Sol high, attempt 26)

card:
- **Blocking: data safety — [scripted.ts:774](/private/tmp/bower-b4b-observations/src/data/spine/scripted.ts:774).** State: remote-preference and gardening facts are live, with no open clarification. Input: one words pile says “Forget my gardening fact”; the model returns `forget:[{factId:"fact-remote"}]`. Production `main` tombstones the remote preference, retains gardening, bins the request, asks nothing, and ends `done`. The single-request shortcut accepts any shown fact without checking its connection to the words. The requested fact remains remembered while an unrelated fact is forgotten. Correct-id control passes.

Prior Bin finding closed. In-memory harness: 68 B4 runtime, 1,430 manifest and 20 recovery cases passed, including frozen/legacy controls. Second way: none found.

Skipped: full suites, `pnpm check`, and e2e. No files changed.

verdict: BLOCK
