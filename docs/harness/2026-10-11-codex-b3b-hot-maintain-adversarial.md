B3b adversarial review — pass 1  
Verdict: **BLOCK**

**Blocking**

- `runner/src/index.ts:76–84`: settled journal changes never enter Recent changes. `refreshed()` builds its listing through explorer entries, which omit `.bower/changes/archive`; the archive-parent check therefore never succeeds.
  - Reproduced through production `main`: two rule changes settle and both journal files are archived, but hot contains only “Rules updated.” Both primary journal rows are missing.
  - This breaks addendum 5’s rolling window of settled changes. Filing/report rows mask the defect in the existing positives.
  - Missing test: multiple settled journal changes survive independently of report summaries.

**Minor / v1 limits**

- `runner/src/index.ts:389,458–462`: the slot cannot yet support B8 health or B4 About me generally. Every declared target gets `.bower` as its parent; visible targets encounter MOC-only admission/rendering. B11’s declared renderer would also be bypassed for MOCs.
- `runner/test/drive-calls-golden.test.ts:97`: notes report the remaining retained-history timing failure: 14,340 ms against strict `<14,328 ms`. The full runner suite remains ungreen.

No second writer or checkpoint protocol found. Verification used in-memory production execution; no files changed, network used, or gates rerun.
