b3b-hot-maintain — scoped adversarial review, pass 3

Verdict: **BLOCK**

- **Blocking — runner/src/index.ts:144–145:** Every unpaired inverse becomes “Undo the last tidy-up,” including ordinary rule Undo. Scenario: run A consumes a rule removal; the person restores that rule through `drive-vault.ts:1500`; run B consumes its inverse. Hot falsely records a whole tidy-up Undo and replaces the inverse’s primary wording. A read-only `hotTarget.render` probe reproduced this. Missing coverage: ordinary rule Undo through main.

Minor / v1 limits:

- `runner/src/index.ts:136`: If the older run folder was removed, its namespace cannot be recovered; its undone row survives.
- `runner/src/hot.ts:106`: Legacy unkeyed rows receive text-derived migration keys; later operation inverses cannot identify them.

Checks: `opKey` is pure, contract-import-clean, and the single key home. Cross-run removal works with retained run folders; rows dedupe by key; dates reuse `timelineDate`. No archive reads added, goldens unchanged, and the red repair switches the expected key to `opKey`. No second mechanism found.

Validation: read-only renderer probe and diff inspection; suites not rerun.
