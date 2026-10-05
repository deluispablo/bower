# Independent immutable ownership byte parser review — qa18

2026-10-05. Fresh independent reviewer `/root/ownership_parser_review`. Planning revision **2026-10-05-contracts-2**, P2, capability foundation **C03/C05/C14/C16**, entry **ownership-byte-parser**. Canonical bower-session and bower-review, reviewer brief, startup/method/coordination, adopted product/work plan/acceptance and relevant architecture were read. Root remains sole coordinator/shared-record writer.

Assigned integration reference **dc537c832c736ae10ec9c4790cd5fc48168a64fb**, product source **1dc7f64b399b9ad2f893648e6e704a1e76905593**, local main **3136adccff8fef2be0f8623d9d574476f27db4c3**. Local and main PLAN_REVISION match. Worker checkout `/private/tmp/bower-p2-ownership-parser`, branch `codex/p2-ownership-parser`, remained clean and pinned at **e3ee111213079708794044cfe6c90d4a1b1bae7d**. Reviewed whole **1c7c9c449f7084469985c1d0c4af88bdde50068f → e3ee111213079708794044cfe6c90d4a1b1bae7d**, including its separate loadable stub **53aeee317d281a065541b456ff57e13562bcdcdc**. That stub is the final fix's sole parent. Only two new files changed: `src/data/vault/ownership-format.ts` and `ownership-format.test.ts`.

Git/shell and standard-library file/hash inspection were available and used. No candidate module import/execution, test, init, build, install, browser, provider/network, private credentials/manifest, Git mutation, source/shared-record change or delegation was performed. Only this new scratch review report was written. Integration moved during review through coordinator-owned documentation work to afb428ec170eda4af9a6211c3e6dc10bc27ba71f; inspection found no src/e2e/scripts/package/lock/config delta from the assigned integration reference. Those coordinator changes were preserved and do not redefine the reviewed candidate.

## Verdict and findings

**No Critical or Important finding and no source/test Minor finding in this exact parser foundation. One Minor evidence-prose discrepancy remains to clarify.** This is a bounded independent review, not integration/proof closure, consumer approval, whole-capability certification or phase acceptance.

**Minor — initial setup preservation is overclaimed in the delivery prose.** `/private/tmp/bower-ownership-parser-delivery.md:37` says the initial owned partial dependency directory was preserved separately. Archived `docs/harness/evidence/2026-10-05-qa18/ownership-parser/setup.json:7` instead records `partial_preserved: false`. Read-only public scratch inventory confirms `/private/tmp/bower-ownership-parser-node_modules-revalidation-partial`, belonging to the second, wrong-prefix baseline attempt; it does not demonstrate an initial preserved artifact. Effect: a closure reader could infer preservation evidence that this packet does not establish. This is a documentation discrepancy, not a parser defect, failed gate, evidence of deletion or proof that an initial directory existed. Root independently confirmed the same distinction; no direct implementer clarification was obtained. Suggested resolution: append an explicit coordinator clarification withdrawing the initial preservation claim as not demonstrated, confirming only the second artifact, while preserving frozen report819/manifestd308 and raw logs. No source changes or repeat full parser review are needed for that clarification. Its publication remains the coordinator's action, not a completed action claimed here.

## Grammar and preservation inspected

The separately adopted TL-P2-2026-10-05-03 decision establishes exact grammar3a55; historical proposal labels remain provenance. `parseOwnership` validates fatal UTF-8 before returning writable authority. Invalid/unsupported/damaged results expose no personal range, payloads or tasks. Exact closed opt-in, duplicate/unknown declarations, four ordered owner pairs, unknown/nested/reversed markers, unclaimed nonblank content and unclosed fences are checked. No valid explicit v2 declaration silently falls through to legacy because its owner framing is damaged. The explicitly preserved unterminated legacy-frontmatter/plain interpretation is covered separately.

V2 half-open spans start after the begin line ending and finish at the end marker's byte start. Initial UTF-8 BOM shifts structural offsets by three and is retained; valid Unicode, decomposed forms, LF/CRLF/mixed endings and subarray-relative positions are preserved. Lone CR in a declared v2 file and invalid encoding refuse content authority. Marker recognition is outside the same exact fence transition used for personal task enumeration: zero through three spaces, matching backtick/tilde character and sufficient closing length, whitespace-only close suffix, no backtick in backtick info. Escaped marker text remains literal. Fenced examples and empty v2 labels do not consume actionable indices. Headings including My notes do not establish ownership.

Legacy scanning tracks existing note-format/TASK_LINE behavior, including no-frontmatter marker-looking content, ordinary My notes, disputed task0/personal task1, legacy fence and empty-line indexing, BOM and normalized-to-raw offset mapping. Canonical personal spans exclude blank separators as independently specified, without changing actionable task ownership. Existing parser/renderer/consumer files are unchanged.

`togglePersonalTask` reparses actual supplied bytes each time and accepts no previous span authority. It checks nonnegative integer index, exact selected label and prior checkbox state; absent/changed tasks refuse before copying. Its sole edit is one ASCII checkbox interior byte in an independent `new Uint8Array(bytes)` copy, including Buffer/subarray inputs. Source input and all other bytes remain unchanged. These are internal typed inputs/results, not a new public Sources/Drive/Worker wire or an external-input validator. The pure module performs no I/O; independent metadata operations remain outside its dependency. This is structural independence, not an executed metadata-operation assertion.

## Evidence identities and test-first quality

Read-only inspection independently matched all **16** archived evidence files to their recorded sizes/hashes and explicit `.ts → .ts.txt` archive mapping. Exact candidate diff and both final sources match their snapshots; committed stub matches its archived loadable API. All **32** canonical SHA256SUMS entries match, including grammar and manifest. Fixture expected spans/results are independently authored literal bytes, not generated from parser output. Eighteen input classifications, seven requested one-byte toggles and inverse originals, all-owner spans and BOM offsets have meaningful assertions. Supplemental cases cover framing, fence, Unicode/endings, absent/changed tasks, legacy indexing and independent copies.

Prepared worker evidence, inspected rather than rerun:

- Initial init DNS failure and wrong `npm_config` baseline did not execute gates; neither is counted as a passing baseline or assertion regression. Recovered unchanged baseline uses the actual `pnpm_config_verify_deps_before_run=false` environment and records **560 tests/52 files** green.
- Original loadable-stub suite records **31 assertion failures/15 passing controls**, with no missing-module/import/TypeError proof. Some damage refusals are intentional stub controls, not newly red regressions.
- First implementation records **46** green named tests. Its full check then genuinely fails the architecture catch-handling sensor (**605 green/1 failed**). The final `expected:` comment explains a pure typed UTF-8 refusal; no sensor or assertion was weakened.
- Later Buffer-copy assertion genuinely catches shared-source mutation (**1 failed/46 green**) separately from the original stub chronology. The implementation changes slice-backed copying to independent copying. Final evidence records **47** named green tests and full **607 tests/53 files** green, with sensors/build completed and registry still **214/218**. The final test delta adds that assertion, removes a no-op replacement and clarifies a title; canonical expectations/suite name are retained.

Immutable SHA-256 identities:

- Delivery: `819be4e6ee6ac42046e702fda3f133c2a6162eee03d92937541c292cb793dae7`
- Evidence manifest: `d30814995aba961da291973c5d192080febc475113b8c76e6aaba9c94cff2225`
- Final parser: `2b177996cd503efb48fee26c2a44f1ada2f22c3543d964b0432458b51dfa9e42`
- Final tests: `6a36cdf293df466e5378f0fd8a21360526992dcb9eec0c8905aa20be51f0e700`
- Adopted grammar: `3a55bfe1d1f2b71e6e7bb2ac35f3fe9e95b9f0452f3e9fae672b84be17025120`
- Canonical fixture manifest: `f673c51e6bb7b0f9e335d2283f5f9203fa1a428d3158799c1df96777354d76fa`

## Integration requirements and limits

The candidate has no existing consumer imports and no dependency/config/shared-record changes. A coordinator may integrate the separate stub and fix after recording the evidence clarification. Actual root check/unchanged verify and inverse-red closure remain required; use `--fixed-in` on the final fix only, restoring the committed loadable stub while keeping final47 tests. Reversing both commits would remove the module and cannot establish a valid regression proof. This reviewer performed no closure.

Set aside by explicit scope: rendering/task-control alignment, Timeline or other-owner splices, rich producers, raw HTTP read/version binding, real writes/CAS, ownership-intent recovery UI, migration, old-writer exclusion/activation/rollback and semantic effects. The parser neither repairs the current rich-state consumer nor closes protected-current-prose, whole C03/C05/C14/C16 or P2. R1-OBS01 remains open; fake/source byte tests cannot certify Google safety. Any later behavioral source/test change requires affected review.
