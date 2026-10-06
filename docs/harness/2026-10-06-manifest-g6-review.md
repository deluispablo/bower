# Independent review g6-review-1: run-manifest-content-consistency

Reviewer: fresh Claude session `g6-review-1` (implementer `manifest-g6-impl-1`, a different Claude session). Target `/private/tmp/bower-p2-manifest-g6`, base `9dd70a0` → tests `9235536` → fix `e21a777`. **Verdict: BLOCKED — 0 Critical, 2 Important, 5 Minor.** Implementation matches Unit G; both blockers are test-power gaps found by mutation (in-memory suite reproducing vitest: 1375 at fix, 54 failing on base).

## Important

1. `run-manifest.test.ts:584-586` (`write` helper) vs `run-manifest.ts:262`: partial overrides change size and digest together, so removing the SHA-256 comparison leaves all 1375 tests green. Same-size different-bytes text (`Receiptz`/`Receipts`, `{}\n`/`[]\n`) is accepted once that check is removed. Fix: `Object.assign(at(...), raw(text), content)` and same-size wrong-digest cases at all three text sites.
2. `run-manifest.test.ts:314-323`: the new membership check now refuses the existing invalid/null/wrong-type ID inputs at `piles.1.pileId`, `members.1.pileId`, `piles.1.memberKeys.0` before the ID guard, so removing the pile `pileId`, member `pileId` or pile `memberKeys` element ID check is caught by no test (base: 10/10/8). Behaviour still changes without them. Fix: negative controls the membership check cannot catch (invalid ID on `piles.2.pileId`; null-key member with invalid `pileId`; invalid `piles.1.memberKeys[1]`).

## Minor (follow-ups)

1. Context version vs file not checked (needs contract owner definition).
2. Unchecked references: null-key member with unknown `pileId`; declared pile with null context key; context key among member keys; observed null-key count vs members.
3. Positive tests at `:683/:687/:688` pin rules the contract leaves open; relabel as not decided by Unit G.
4. Blob `beforeContent` on `write-runner-json` accepted.
5. Comment at `run-manifest.ts:176` overstates the rule (code enforces at most one member).

Changed existing tests judged legitimate (blob create refusal is contract-correct; synthetic digests/sizes fixed; linked renames for positives) — but finding 2 is the matching negatives.

## Delta review (same reviewer): `e21a777` → rework tests `71badc0` → comment `4b8259d`

**Verdict: CLEAN — 0 Critical, 0 Important.** Reviewer's in-memory mutation suite at `4b8259d`: fix passes 1414; base module fails 63. SHA-256 removal now caught by 15 tests (was 0), size 10 (was 1), pile/member `pileId` ID checks 10 each and `memberKeys` element 9 (were 0). `write` helper varies one field at a time; new negatives cannot be refused by the membership check first; no existing assertion weakened; relabelled block stays inside the verify describe (123 selected); comment commit is comment-only. Open follow-ups: Minors 1, 2, 4 above.
