# B5c adversarial pass 3 (Sol high, attempt 18)

card:
- **Blocking: data safety — [src/data/spine/scripted.ts:2034](/private/tmp/bower-b5c/src/data/spine/scripted.ts:2034).** With source `Alex uses TypeScript.`, select its valid sentence reference and rename it to `Alex CV]] Alex has diabetes. [[CV.txt`. Admission, planning and the ordinary engine persist:
  `Alex uses TypeScript. [[Areas/Career/Alex CV]] Alex has diabetes. [[CV.txt]]`
  This works for both profile creation and editing. Unescaped citation paths reintroduce model-authored health claims. The same path exposes `ID-884422` when the filed name is `Alex passport ID-884422.txt`, despite identifier-free source text.

- **v1 limit — [runner/src/claude.ts:925](/private/tmp/bower-b5c/runner/src/claude.ts:925).** Source `Alex does not\r\nuse TypeScript.` offers no sentences; reference 1 is refused. The control-character check rejects the internal CR in a wrapped CRLF sentence. Ordinary filing preserves the original.

All four exact pass-2 findings are closed. Second mechanism: no.

Skipped full suites, e2e and live-model checks; used offline in-memory probes. No files changed.
verdict: BLOCK
