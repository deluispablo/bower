# B5c adversarial pass 6 (Sol high, attempt 31) - the last

card:
- **Blocking: data safety — [claude.ts:902](/private/tmp/bower-b5c/runner/src/claude.ts:902).** The filter excludes filed Markdown originals: ordinary filing stamps them `by: bower`.
  State: personal `Alex CV.md` (`f14`) says “Alex uses Python”; uploaded `Alex CV.txt` (`f13`) says “Alex uses TypeScript.”
  Profile: `Alex uses Python. [[Alex CV]]`.
  Wrong output: both provider prompt phases attach `fileId: f13`. Ambiguity must yield no id; only generated Source notes may be skipped.

The pass-5 uploaded-original case is closed. Second mechanism: no.

Skipped full suites, e2e and live-model checks; reproduced with in-memory provider tests. Risk: false source attribution.

verdict: BLOCK
