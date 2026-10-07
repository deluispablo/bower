# Technical-lead decision TL-P3-2026-10-07-22: the report barrier, wiring the runner, and what the owner sets up in P3

**Coordinator questions, 2026-10-07:** the `no-folder` answer on `/process`, and the scope of `spine-report-barrier-dispositions`.

1. **`no-folder` goes in the contract's `/process` row** ("Choose a folder for Bower first."), as built.
2. **`spine-report-barrier-dispositions`** (`bower-escalated`) makes a run end truthfully ([ARCHITECTURE](../ARCHITECTURE.md) invariant 6: persist the report before publishing success; never show success or blindly repeat effects):
   - **Dispositions.** Every manifest item ends with one recorded outcome (`pile-disposition.ts`): filed, set aside (it stays in the inbox, untouched) or waiting (it changed since admission).
   - **The report files.** After the last operation checkpoint, the runner writes the report files the contract lists, with `.bower/last-run.json` last, and reads it back (`md5Checksum`). Only then does it report `done`.
   - **A failed report save.** The run stays in `saving`, and the checkpoint chain records "effects done, report pending". A redispatch resumes at the report step only; the checkpoints stop the effects from repeating. Past the recovery ceiling, the run ends `failed` with a sentence that says changes were made and the summary could not be saved. It never says nothing happened.
   - **The runner is wired.** `runner/src/main.ts` calls token → spine → barrier → status, so the runner runs end to end. Its tests inject a provider stub.
3. **Next comes `scripted-semantic-provider`.** It is the first entry whose runs on Actions give meaningful results, so the `bower-home` replacement (TL-P3-13) comes with it.
4. **The owner sets up only `GITHUB_TOKEN` in P3.** P3 runs only the scripted provider, with no model ([P3_ACCEPTANCE](../P3_ACCEPTANCE.md) owner setup, step 5). The Claude credential in the instance repository moves to P4, when a model first runs.
