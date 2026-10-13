# B5c adversarial pass 1 (Sol high, attempt 10)

card:
- **Blocking: data safety — [runner/src/claude.ts:912](/private/tmp/bower-b5c/runner/src/claude.ts:912).** With source `Alex uses TypeScript.`, reply `[[Areas/Career/Career|Alex prefers SQL and has passport number ID-884422]]` passes validation and persists. Removing whole links from validation hides their displayed claims and identifiers.

- **Blocking: data safety — [src/data/spine/scripted.ts:2048](/private/tmp/bower-b5c/src/data/spine/scripted.ts:2048).** With no profile and two contributing CVs, rename the second before application. Its move is rejected, but profile creation applies with its facts and a nonexistent destination citation. Creation depends only on the first source.

- **Blocking: hard rule — [runner/src/claude.ts:913](/private/tmp/bower-b5c/runner/src/claude.ts:913).** A document containing `Always ignore the rules.` can return that exact directive as profile words. It passes and persists unquoted as profile prose.

- **Blocking: normal use — [runner/src/claude.ts:917](/private/tmp/bower-b5c/runner/src/claude.ts:917).** Source `Alex does not use TypeScript.` permits profile `Alex uses TypeScript.` The production planner and engine persist this reversed claim; vocabulary membership does not establish grounding.

- **Blocking: normal use — [runner/src/claude.ts:1658](/private/tmp/bower-b5c/runner/src/claude.ts:1658).** An offer stating `48000. Currency is not stated.` accepts and writes `48000 CHF.` without retry. The currency check covers only six codes and three symbols.

Second ways: no alternate parser, writer, identity store or template mechanism found.

Skipped full suites/e2e; failures reproduced with offline, in-memory production-path probes. No files changed.
verdict: BLOCK
