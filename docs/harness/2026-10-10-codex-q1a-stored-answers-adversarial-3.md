**Q1a stored answers — adversarial review, pass 3**

**Verdict: BLOCK**  
Range: `dcffff22..d190cba2` (`src`, `runner`).

1. **Blocking — unavailable-folder answers never re-ask a loose Inbox file.**  
   `src/data/spine/scripted.ts:748`, `:990`, `:997`.  
   Scenario: ask about a file directly in Inbox, choose Home, then bin Home before the continuation. The continuation retains `reask` at count one. On the next tidy, let the model propose a valid alternative placement without an asking. The fallback rejects a pile asking because the loose file is a content member; the member-asking caller suppresses all loose-file askings. Placement is also suppressed, leaving the file waiting indefinitely without round two. This violates addendum 5 in normal use.  
   In-memory execution of the actual fallback and caller confirms both asking outputs are absent; the folder-member control produces a re-ask. Missing pin: fix 3.1’s scenario with a loose Inbox file.

**Pass-2 finding checks**

- **#1: partially fixed and pinned.** The folder-member scenario is covered at `runner/test/q1-continuation.test.ts:1262`; the loose-file defect remains.
- **#2: fixed and pinned.** Maximum matching history at `src/data/contracts/questions.ts:102`, member eligibility at `src/data/spine/scripted.ts:979`; mixed histories covered at `runner/test/q1-continuation.test.ts:1311`.
- **#3: fixed and pinned.** Member holding at `src/data/spine/scripted.ts:997`; existing and later clear siblings covered at `runner/test/q1-continuation.test.ts:1373`.

**Minor / v1 limits**

- No second mechanism, store or counter found; the existing subject policy and questions-file rounds remain the homes.
- Reds loosen nothing: all pre-existing test bytes are preserved; no test changed after `c72e4fa2`.
- Golden and fingerprint files are unchanged.
- Review was static plus an in-memory check. Production suites were not rerun; no files were edited.
