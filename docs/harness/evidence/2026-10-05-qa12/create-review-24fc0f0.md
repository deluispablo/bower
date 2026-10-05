# Independent review: create-leading-dot

Verdict: **No Critical, Important or Minor correctness findings in the assigned candidate.** Both sources now refuse a leading-dot note/folder before source or journal mutation. Coordinator browser/integration/proof closure remains required; this is not complete C03/C16 or P2 acceptance.

- Reviewer: independent Codex `/root/o1_audit`, `p2-create-review-2026-10-05`, separate from builder.
- Planning/phase/capabilities: `2026-10-05-contracts-2` / P2 / C03,C16.
- Exact range: `f9f0bf795f8114356f26c668d3003c7515e8b052..24fc0f0eef764b9b0c7aa01c20b83ed372fa80c0`.
- Frozen checkout: `/private/tmp/bower-p2-journal-ack`, clean `codex/p2-create-names`, HEAD matches target. Refreshed live integration ACTIVE and browser reservation. Reviewer made no source/build/test/server changes while coordinator owns targeted browser use.
- Diff includes only allowed `src/data/tree.ts`, `src/data/demo/world.ts`, `world.test.ts`, `src/data/vault/drive-vault.ts`, `drive-vault.test.ts`, `e2e/qa12.spec.ts`. No wire/schema or rename implementation changes, shared records or proof writes.
- No reviewer tests, builds, installations, browser use or delegation. Only authorized temporary report written.

## Behavior checked

`checkCreationName` at `src/data/tree.ts:71–74` rejects `name.trim().startsWith('.')` using existing conflict/BowerError conventions, then delegates to unchanged length validation. It is a pure shared helper and does not modify/sanitize names as a side effect.

DriveVault calls it at `src/data/vault/drive-vault.ts:224`, after read-only parent resolution but before free-name/path calculation, Drive create at 227, index mutation at 228 or journal record at 229. Demo calls it at `src/data/demo/world.ts:628`, before entries.set at 630 and record at 631. Surrounding whitespace, `.`, double-dot and standard `.Garden` forms therefore fail before writes. Drive failure precedence for missing parents remains consistent with its previous path.

The four parameterized refusal cases cover demo/Drive × note/folder. They assert identical safe error, unchanged trees/journals and (Drive) complete snapshot, including hidden entries/Bin. The snapshot assertion matters because a hidden created file might not appear in the visible tree.

Added `creation keeps dotted names defaults and length limits (%s)` cases prove ordinary Garden.2026, defaults, 120-character boundary and over-limit refusal for both sources/types. Existing length semantics remain unchanged. `renameEntry` and reserved-name rules are untouched; full check includes prior shared contract/rename regressions. No broad ban on internal dots was introduced.

## Phone regression honesty

`e2e/qa12.spec.ts:5` parameterized `phone creation refuses a leading dot and retries a dotted name (${type})` targets both types. It uses existing fixtures to inject the selected demo/fake source, checks refusal toast, original route/heading and closed sheet, then reopens the real menu and successfully creates/navigates to Garden.2026. No source/storage injection or fake successful result is used. Existing `NameSheet.tsx:29–49` trims/sanitizes, closes before source save, reports failure and opens only on success; the authored test accurately reflects its retry-through-reopen behavior. On base code it would fail its refusal expectation/navigation checks. Desktop is intentionally skipped because this test targets the phone menu; unit source coverage is not device-specific.

Reviewer inspected the corrected test but did not execute it. The coordinator’s first browser run on superseded 5c08e24 passed the refusal toast and unchanged URL, then failed both demo phone cases at the exact Cooking accessible-name heading selector; fake had not run. The h1 contains a nested More control, so its accessible name is larger than the visible heading text. Revised candidate changes only those two test assertions to check heading text. Coordinator is rerunning targeted demo/fake on frozen 24fc0f0; its completed result was not yet supplied to this renewed review. This report does not claim revised phone/manual visual evaluation passed.

## Supplied unit/check evidence

Unchanged verify: `pnpm vitest run src/data/demo/world.test.ts src/data/vault/drive-vault.test.ts -t "creation refuses a leading dot without writing"`.

- `/private/tmp/bower-create-leading-dot-red.log`: four genuine assertion failures, each promise resolves to a created hidden path instead of rejecting; not missing imports/modules/infrastructure.
- `/private/tmp/bower-create-leading-dot-green.log`: four named cases pass, 89 unrelated tests skipped by selection.
- `/private/tmp/bower-create-leading-dot-check.log`: original 51-file / **420-test** check. `/private/tmp/bower-create-leading-dot-revised-check.log`: renewed exact-candidate check again records **420 tests passed**, build and sensors complete. Preexisting bundle-size warning remains.

Reviewer read supplied evidence; no gate executions. Coordinator retains closure authority and must complete applicable combined browser gates/evaluation. Real Drive, all browser permutations, complete accessibility/usability and broader input/path validation are outside this bounded review. No phase acceptance or provider guarantee implied.

## Renewal and superseded selector issue

The source assessment from `f9f0bf7..5c08e24` is retained because inspected `git diff 5c08e24 24fc0f0 -- src` is empty. Full old-to-new diff contains only `e2e/qa12.spec.ts:18` and `:26`: exact heading accessible-name/visibility assertions become `getByRole('heading', { level: 1 }).toHaveText(...)` within main. Error toast, original URL, closed-sheet check, actual reopen/retry, successful target URL and exact visible heading text all remain required. The corrected locators correspond to existing heading markup; no product assertion is removed to conceal a failure. The source unit assertion red remains valid; the old browser failure is a test-selector issue, not an additional source red proof.

Superseded browser log `/private/tmp/bower-create-candidate-browser.log` inspected: two demo phone cases failed at heading locator after preceding checks, two desktop cases intentionally skipped, fake not reached. Expected rejection BowerError diagnostics appear. The earlier review did not catch this exact locator mismatch by inspection; its source conclusions stand, but its phone-test assessment is replaced by this renewed report. No integration or closure occurred on the superseded target.

Renewed verdict: **No Critical, Important or Minor findings in the revised assigned range.** Entry closure remains conditional on coordinator browser/integration/proof evidence. No reviewer tests, builds, browser activity, repository edits or delegation.
