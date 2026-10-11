B3b adversarial review — pass 2, scoped

Verdict: **PASS**

No Blocking findings.

- `runner/src/index.ts:79–134`: captured journal rows enter Recent changes when their archive moves settle, using captured bytes and outcomes without archive reads.
- `runner/src/index.ts:398–499`: declared paths select their parent; declared renderers take precedence over fallback MOC rendering. No second writer or checkpoint protocol found.
- `runner/test/drive-calls-golden.test.ts:99`: retained base rises by exactly 600 ms—four named calls × 150 ms. Strict `<` and the 20% factor remain unchanged. Other goldens are unchanged; production fix changes no tests.

**Minor / v1 limits**

- `src/data/contracts/run-manifest.ts:574–581`: future B8 health/B4 About me targets still fail manifest admission unless allowlisted or existing captured MOCs. Missing visible targets also fail. Parent/render dispatch is fixed, but general admission remains MOC-only.

Verification: source, diff and recorded evidence inspection only; no tests rerun, network access or file edits.
