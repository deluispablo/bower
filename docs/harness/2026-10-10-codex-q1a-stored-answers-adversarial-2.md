**Q1a stored answers — adversarial review, pass 2**

**Verdict: BLOCK**  
Range: `a568d4cc..e4f61e95` (`src`, `runner`).

1. **Blocking — unavailable-folder consent is forgotten before the next run.** `src/data/spine/scripted.ts:725`, `:1880`, `:2366`. Choose Home, then bin it or move it under Inbox. The continuation holds the item, closes the asking and archives the answer. On the next tidy, a valid model placement into Job hunt is accepted without another question. This violates addendum 4. Missing red: repeat the alternative placement on the next run. `runner/test/q1-continuation.test.ts:1134` instead supplies the desired new asking itself.

2. **Blocking — multiple member histories still bypass the two-round cap.** `src/data/contracts/questions.ts:89`; `src/data/spine/scripted.ts:962`, `:1921`. In one unchanged pile, member A has one asking while member B has exhausted two. Answer A, then receive a pile-level asking. `roundFor` selects A’s first matching record, permitting an asking that covers B a third time. The lookup was confirmed in memory. Missing red: two members with different round histories before switching to the pile. Fix 1.3 covers one remaining member.

3. **Blocking — an exhausted member prevents clear siblings from filing.** `src/data/spine/scripted.ts:738`, `:961`. Exhaust one member, then add a clear sibling to that pile without changing its words. Even with a valid model placement for the sibling, the member’s history makes `exhausted(pile.id)` true and skips the entire pile. Missing red: exhausted member plus clear sibling in the same pile; the repair fixtures move the clear sibling out beforehand.

**Minor / v1 limits**

- Prior findings 1, 2, 4, 6 and 7 have matching production-path repairs and regression coverage, subject to the multi-member failure above.
- No second mechanism, store, counter or scheduler found; the changes reuse the shared subject policy and existing consent/provenance boundaries.
- Existing reds retain their assertions: the test diff adds 337 lines and removes none. Goldens and fingerprints are unchanged.
- Review was static plus an in-memory identity check; production suites were not rerun and no files were edited.
