# B4b adversarial pass 3 (Sol high, attempt 16)

card:
- **Blocking: data safety — `src/data/spine/scripted.ts:2606`, `src/data/spine/engine.ts:550`.** Start with “Remember: Alex prefers remote roles.” After the ledger append succeeds, append “Also remember Alex grows beans.” to the words note. Production `main` bins the changed note and its parent, records only the remote preference, and reports `done` without a not-done row. Unread words disappear from the inbox.

- **Blocking: data safety — `src/data/spine/scripted.ts:2623`.** With the same request, let the ledger succeed but reject the words note’s Bin with a conflict. The parent Bin depends on the ledger, without depending on the note’s Bin. It succeeds and hides the unconsumed note; `main` ends in `saving` without a published not-done row.

All four prior findings are closed under addendum 14; their 12 reproduction/control cases passed through `main` using fake Drive and an in-memory temporary filesystem. No second mechanism found.

Skipped: full suites, `pnpm check`, and e2e. No files changed; both new data-safety failures were reproduced.

verdict: BLOCK
