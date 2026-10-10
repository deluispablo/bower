b1a-contract — pass 4, scoped review

Verdict: PASS  
Range: `3e11cec1..efd10b40`

No Blocking findings in normal use.

- `runner/src/index.ts:73`: stored parent ids retain ancestry when planning omits a binned or moved-out subtree; `VaultIndex.drop` removes its descendants.
- `runner/src/index.ts:111`: inside renames and moves recompute recursive paths while preserving version-matched summaries and coverage without content re-reads.
- `runner/test/b1a-contract.test.ts:828`: four appended reds exercise Bin, metadata-free removal, move out, rename and nested move through main, with positive controls, cursor commits and zero descendant media reads.
- Existing tests remain unchanged; goldens remain 88/99. No second mechanism: ancestry and subtree operations reuse `VaultIndex`.

v1 limits:

- `runner/src/index.ts:74`: legacy or malformed state without ancestry cannot identify an already-vanished folder’s cached descendants.
- `runner/src/index.ts:96`: moving or renaming a visible subtree into a hidden path can retain its old projection until subsequent maintenance.
- Validation was inspected statically. Recorded red/green results are in the notes; referenced logs were absent, and tests were not rerun.
