# B4a adversarial pass 4 (Astra high, attempt 16, after fix round 3)

1. **Blocking: data safety** — [observations.ts:111](/private/tmp/bower-b4a-contract/src/data/contracts/observations.ts:111): Record fact A in run A, then replay its same source/hash/text in run B under another section with fresh IDs. Undo run A. The reducer returns B as live: including `section` in the evidence identity lets replay resurrect invalidated evidence.

2. **Blocking: data safety** — [run-manifest.ts:833](/private/tmp/bower-b4a-contract/src/data/contracts/run-manifest.ts:833): Store “Alex grows beans.” in both `about-you` and `about-preferences`. Append its Forget tombstone and archive/rebuild only preferences to the bare heading. The ledger correctly has zero live facts, but validation returns `ok:true` and admission returns `null`, leaving the forgotten sentence visible in `about-you`.

3. **Blocking: hard rule** — [run-manifest.ts:751](/private/tmp/bower-b4a-contract/src/data/contracts/run-manifest.ts:751): With About me missing and no admitted evidence, submit `create-text`, `purpose: generated`, targeting root `About me.md`. Supply the existing template plus regions containing “Alex prefers invented work.” Validation returns `ok:true`; admission returns `null`. Missing-note creation bypasses initialization’s evidence check entirely.

4. **Blocking: hard rule** — [note-edit.ts:939](/private/tmp/bower-b4a-contract/src/data/contracts/note-edit.ts:939): Start with a valid ownership/2 About me and an empty ledger. Initialize the three empty regions followed by unmarked `Alex prefers invented work.\n`. Authoring and manifest validation succeed; admission returns `null`. The extra prose escapes both region restrictions and evidence validation.

No second parser, writer, or region mechanism found. Eighty additional in-memory control assertions passed.

Not checked: full suites, e2e, or B4b/B4c runtime wiring; the four reproduced contract gaps remain.
verdict: BLOCK

Gates b4a-g5: check, capabilities e2e on demo and fake green.
