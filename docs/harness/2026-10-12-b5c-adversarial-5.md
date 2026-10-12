# B5c adversarial pass 5 (Sol high, attempt 27)

card:
- **Blocking: hard rule — [claude.ts:902](/private/tmp/bower-b5c/runner/src/claude.ts:902).**
  Uploaded originals carry `bowerItem` too, so the filter wrongly excludes them.
  State: uploaded `Areas/Career/Alex CV.txt` (`f11`) says “Alex uses TypeScript.”
  Unmarked `Resources/Old/Alex CV.txt` (`f13`) says “Alex uses Python.” A generated Source also exists.
  Profile text: `Alex uses TypeScript. [[Alex CV]]`.
  Wrong output: both prompt phases attach `fileId: f13`; ambiguous originals must yield no id.
  Without the old file, the unique uploaded original incorrectly loses its id.
  Reproduced through the actual provider using in-memory storage; violates addenda 19–20.

Pass-4 finding closed. Second mechanism: no.
Skipped full suites, e2e and live-model checks; risk: false source attribution. No files changed.
verdict: BLOCK
