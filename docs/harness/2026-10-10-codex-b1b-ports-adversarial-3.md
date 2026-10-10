# B1b ports — adversarial review, pass 3 scoped

**Verdict: BLOCK**

Range: `HEAD~3..2028dddf`  
Worktree: `/private/tmp/bower-b1b-ports`

1. **Important — `src/data/drive/fake-drive.ts:123`: restoration retains legacy character-count sizes.** Restore a pre-fix snapshot containing `{ text: "é🙂" }` and `meta.size: 3`. `get()` reports 3, while `readBytes()` contains 6 bytes. A subsequent rename publishes the same incorrect size through `listChanges()`, preserving the fake/HTTP mismatch. Restore must normalize size when original media is available while preserving unavailable-media sizes.

   **Missing regression — `src/data/drive/parity.test.ts:130`:** restoration tests only newly corrected snapshots; add a pre-fix Unicode snapshot and verify restored metadata and native changes.

Creates and writes now use UTF-8 byte lengths at `fake-drive.ts:554,655`, including shared fenced paths. Blob sizes remain byte-based.

Fixture check: seed code has no fixed size expectations; ASCII sizes and explicit restored fixture sizes remain unchanged. Unicode seed metadata changes correctly. No additional Drive calls are introduced; golden assertions are unchanged. Golden execution was not verified.

Second mechanism: none introduced. Static review only; no tests, edits, or network access.
