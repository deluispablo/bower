**b3a-hot-reduce adversarial review**

Verdict: **BLOCK** — `5cadec36..9a396baa`. No second mechanism found in the scoped diff.

1. **Blocking: collapsed text can still create headings and nested rows.**
   [runner/src/hot.ts:70](/private/tmp/bower-b3a-hot-reduce/runner/src/hot.ts:70):
   question text `"## Injected"` → `- ## Injected`, a CommonMark heading inside the list.
   Text `"- Extra row"` → `- - Extra row`, a nested list item.
   Both violate packet point 3. The red at `runner/test/b23-hot.test.ts:165` is weaker:
   it puts syntax after ordinary text and checks only lines starting with `## `.

2. **Blocking: focus/recent caps add marks reserved for word cuts, consuming valid evidence.**
   [runner/src/hot.ts:48](/private/tmp/bower-b3a-hot-reduce/runner/src/hot.ts:48):
   six short eligible hubs and eleven short changes → cap-only `- (1 more)` in both sections.
   Packet point 2 specifies a cap mark only for threads; point 4 adds other marks when cutting for 300 words.
   Concrete boundary: hubs `H0…H5`; changes `c00…c10`, all dated `2026-10-09`;
   `c00` has 243 words, every other change one word.
   Five hubs plus ten changes total exactly 300 words → implementation shows only eight changes,
   with focus `- (1 more)` and recent `- (3 more)`.
   The red at `runner/test/b23-hot.test.ts:99` codifies the conflicting cap marks.

Minor:

- `runner/test/b23-hot.test.ts:44`: filtering blank lines lets the empty-section red accept forbidden padding; code emits none.
