# B5c adversarial pass 4 (Sol high, attempt 21)

card:
- **Blocking: data safety — [scripted.ts:2037](/private/tmp/bower-b5c/src/data/spine/scripted.ts:2037).**
  State: one Bower-owned `profile=cv`; `Alex CV.txt` contains `Alex uses TypeScript.`
  Select sentence 1 and a new destination `Resources/Passport ID-884422`.
  Admission and the ordinary engine persist:
  `Alex uses TypeScript. [[Resources/Passport ID-884422/Alex CV.txt]]`
  The model introduces an identifier through the destination despite identifier-free evidence.
  Admission checks the source’s name, but the citation includes the unchecked destination.

- **v1 limit — [scripted.ts:2042](/private/tmp/bower-b5c/src/data/spine/scripted.ts:2042).**
  With that CV, no existing profile and no destination hub, selecting sentence 1 refuses planning twice.
  The CV remains in Inbox instead of filing without a profile update.

The exact pass-3 attacks are closed. Second mechanism: no.

Skipped full suites, e2e and live-model checks; used offline in-memory provider/engine probes. No files changed.
verdict: BLOCK
