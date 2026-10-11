# B4b adversarial pass 4 (Sol high, attempt 21)

card:
- **Blocking: data safety — [scripted.ts:1258](/private/tmp/bower-b4b-observations/src/data/spine/scripted.ts:1258), [scripted.ts:2623](/private/tmp/bower-b4b-observations/src/data/spine/scripted.ts:2623).** Declared piles omit the words-item Bin, leaving the parent Bin without dependencies. Start with an app-style declared words-only pile containing “Remember: Alex prefers remote roles.” and an empty ledger. Reject the ledger write with a conflict: production `main` bins the parent, hides the unconsumed request, leaves the ledger empty, and ends in `saving` without a report. Alternatively, append “Also remember Alex grows beans.” before the parent Bin: the changed, unread words are hidden too. Both failures also reproduce for filing and Forget.

Both prior reproductions pass for observed piles; all 56 targeted cases passed in the in-memory harness. No second mechanism found.

Skipped: full suites, `pnpm check`, and e2e. No files changed; declared-pile data safety remains unresolved.
verdict: BLOCK
