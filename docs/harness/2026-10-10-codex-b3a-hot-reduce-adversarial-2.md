**b3a-hot-reduce — adversarial review, pass 2**

Verdict: **BLOCK** — `9a396baa..eb1866c7`

1. **Blocking — HTML can still start a block inside a row.** `runner/src/hot.ts:27` omits `<` from escaping.
   - Question `<script>injected</script>` → `- <script>injected</script>`, a CommonMark HTML block.
   - Hub `" \n<div>"` → `- <div> (2026-10-09)`, also an HTML block after collapse.
   - Violates packet point 3. Missing regression: HTML-block inputs at `runner/test/b23-hot.test.ts:207`.

Minor:

- Cap marks and 300/301-word boundaries pass read-only probes, including escaped text.
- Empty-output red now rejects padding; red repair preserves numeric bounds and corrects cap expectations.
- No second mechanism found in the scoped diff.
