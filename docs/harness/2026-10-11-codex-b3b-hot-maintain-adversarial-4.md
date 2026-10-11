b3b-hot-maintain — scoped adversarial review, pass 4

Verdict: **PASS**

No Blocking findings.

- `runner/src/index.ts:140`: Ordinary inverses retain their primary wording and their own `opKey`.
- `runner/src/index.ts:149`: Whole-run Undo wording comes from its primary request; ordinary inverses receive no synthetic label.
- `runner/src/index.ts:138`: The undone prior row is removed. Read-only probes confirmed zero archive reads.
- Goldens are unchanged. No second mechanism was added.

Minor / v1 limits:

- `runner/test/b23-hot-context.test.ts:9`: The new `DriveVault` import introduces **17 runner type-check errors** involving browser types. `pnpm -C runner exec tsc --noEmit -p .` fails at HEAD; baseline `4282aa78` has zero diagnostics. HEAD production code with the baseline test also has zero.
- `runner/src/index.ts:137`: If an older run folder was removed, its namespace cannot be recovered; its undone row survives.
- `runner/src/hot.ts:106`: Legacy unkeyed rows retain text-derived migration keys; later inverses cannot identify them.

Validation: diff inspection, in-memory renderer/declaration probes, and compiler comparisons. Suites not rerun; no files edited.
