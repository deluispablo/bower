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

## Addendum: P3-11 close, the scripted provider's scope, and who pushes to the instance repository

- **P3-11 closes with `spine-report-barrier-dispositions` alone.** C14 on staging passed steps 1–5 and 7. Step 6 (a lease that expired with nobody taking it) is covered by the Worker and fake lease tests, and is recorded as not walked.
- **`scripted-semantic-provider`** (`bower-escalated`). Scope as drafted, plus one addition:
  - one provider interface in the shared spine module;
  - a deterministic scripted provider that gives the fake's semantic results for the C04–C11 journeys, chosen in `runner/src/main.ts` by environment;
  - the `tidy.yml` workflow (`bower-tidy`, Node LTS, concurrency per `run_id`, `run-name` per the contract);
  - the adapted `new-instance.sh`, which builds the bundle and copies it, `tidy.yml` and nothing secret;
  - **the addition:** `main.ts` builds the real Drive effects on the `runner-drive-adapter` `FencedDrive`, so a run on Actions really changes the person's folder. Effects injected only in tests are not enough for C12.
- **The lead pushes the replacement.** TL-P3-13 already lets the lead push to the instance repository for the probe and for the replacement, and `gh` there has the `workflow` scope. Workers never push. The lead runs the adapted `new-instance.sh` once the entry closes on `main`, with the original's workflows removed in the same commit.
- **The owner's only step** is to create the fine-grained `GITHUB_TOKEN` (instance repository only; Contents read and write, Actions read) and set it with `wrangler secret put GITHUB_TOKEN --name bower-staging`. The lead asks for it at the replacement.

## Addendum: the P3-11 review, three Important findings → `report-barrier-truth-fix`

All three findings are the same defect: the run's ending must match what happened. The coordinator's drafts are adopted, with one addition to I2.
- **I1.** The run sends `saving` only when the chain holds an applied effect. When nothing was applied, a failed save ends `failed` with "The tidy-up stopped before changing anything. Try again." Any uncaught error after an applied effect follows the same rule.
- **I2.** A 409 `stale-report` carries the Worker's `{ seq, phase }`.
  - The runner continues from `seq + 1`, and never swallows a refused `done`.
  - **The addition:** when the Worker's phase is already `done` or `failed`, the runner treats the run as finished and sends nothing more.
- **I3.** The barrier writes `.bower/runs/<run_id>/dispositions.json` before `last-run.json`, with one line per manifest item, journal lines included. `pile-disposition.ts` stays as it is.
- **Order.** One `bower-escalated` entry, dispatched after `scripted-semantic-provider` merges, because both touch `main.ts`. A re-review follows, then P3-11 and P3-12 close together.
