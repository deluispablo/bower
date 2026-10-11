**Q1c live questions — adversarial review, pass 3**

Verdict: **BLOCK**

- **Blocking — `runner/src/status.ts:76,142`: the 64 KiB bound still fails publication.** Ten valid cards with 7,000-character `words` fields produce a 71,093-byte report. Both snapshot and storage validators accept them, but `request()` throws without trimming or logging an omission. Scripted questions carry pile text (`src/data/spine/scripted.ts:996`), so ordinary context can reach this case. The awaited publication at `runner/src/main.ts:297` stops effects; subsequent status reports retain the oversized snapshot and also fail.

- **Blocking — `runner/src/status.ts:84,168`: publication transport errors still fail the run.** If the publication request receives 503 through all four sends, it throws. Earlier ordinary reports can succeed and the service can recover immediately afterward, yet `runner/src/main.ts:198,297` ends the run failed before planned effects or question storage. This violates “Live publication never fails a run.”

Checks otherwise: count, card-length and shape omissions preserve stored data and log once per publication. Worker validation remains strict (`api/src/runner.ts:113`). No second scripted bound or publication mechanism was added.

Minor / v1 limits:

- None found within scope.

Validation: reproduced both exceptions using current code in memory with simulated responses; no network or file writes.
