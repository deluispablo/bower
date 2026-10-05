# Independent combined naming checkpoint review

Adopted revision: **2026-10-05-contracts-2**; current P2 acceptance; **C03/C16 with C01/C14 interactions**.

Exact reviewed target: `907c9f806e4e6c6b33e595c33232e27257913fdf`.
Exact integrated production source: `44ee162abfeb77ec168d18b5e66cd24a43619915`.
Adoption base: `143ae2b12d5440330bee1a85bd16e90b8dccf746`.
Integration: `/Users/deluisp/Projects/bower-app`, `codex/close-phase-2`.

**Verdict: no unresolved Critical, Important or Minor regression identified in the assigned naming entries or inspected combined interactions.** Independent source review is complete for this immutable checkpoint. Neither naming entry is closed by this report; fresh gates, proof and evaluation status remain coordinator responsibilities. No P2/full-capability acceptance is implied.

## Scope and immutable continuity

Inspected current naming code/tests, their producer/consumer paths, registered verifies, retained assertion red/green logs, previous independent reports and isolation proof. The planning revision matches local main. Current source/e2e/package/lockfile/Vite/Playwright/scripts differences from independently reviewed isolation replacement `2244218c60f25ffa5f8991a905f52eba9f460199` are empty. The full adopted-base delta has nineteen source/e2e files, covering eight bounded foundations and the two naming entries; the preceding reports preserve independent inspection of those foundation candidates and actual rejection/correction history.

Public Sources/types/Worker wire/layout/provider files have no change from adoption. This checkpoint introduces no new schema, producer authority, ownership grammar, account policy or architecture adoption. A later docs-only freeze requires explicit source/e2e/build-configuration identity reconciliation; this report does not automatically review a moving HEAD.

## Naming behavior and test coverage

| Entry | Current behavior and references | Regression/proof assessment |
| --- | --- | --- |
| create-leading-dot, integrated `28d2ce2` | `tree.ts:71–74` rejects trimmed leading dots then applies existing length validation. Demo `world.ts:628` checks before entries/journal mutation. DriveVault `drive-vault.ts:243` checks before Drive create, index update and journal record (:246–248). Ordinary dotted stems, defaults and prior length semantics remain supported; rename validation is unchanged. | Unit cases `creation refuses a leading dot without writing (note/folder)` in demo world.test.ts:8 and DriveVault test.ts:28 check unchanged tree/journal plus full Drive snapshot, including hidden files. Four genuine original assertion reds resolved hidden paths rather than rejecting. Compatibility cases `creation keeps dotted names defaults and length limits (note/folder)` check dotted names, defaults and 120/121 boundary. |
| timeline-source-names, integrated `6305ca9` | `NoteScreen.tsx:97–109` separates source target/alias, classifies the resolved tree node, strips file extensions via thingName and retains complete folder names. Explicit aliases remain verbatim; unresolved targets remain authored text; existing web handling/attributes are preserved. | `timeline source links use plain file names and retain aliases` (qa12.spec.ts:30) asserts naked PDF/image labels and actual pages, authored PDF alias, web href/target, real folder rename and complete dotted-folder label/click/destination on phone and desktop. Prior indiscriminate folder stripping produced two real failures per source at the dotted-folder link; replacement passed two per source. |

Exact registered verifies remain unchanged at target:

- create-leading-dot: `pnpm vitest run src/data/demo/world.test.ts src/data/vault/drive-vault.test.ts -t "creation refuses a leading dot without writing"`.
- timeline-source-names: `bash scripts/e2e-both.sh e2e/qa12.spec.ts -g "timeline source links use plain file names and retain aliases"`.

Both still have passes=false in harness/features.json (:2506, :2520); no naming proof appears in the reviewed proof.log. Inverse-patch tests are behavior-sensitive: removing the creation validation exposes an actually created hidden name; removing Timeline typed/plain rendering exposes the naked file label or reachable renamed-folder label failure. The harness fixed-in mechanism reverses the specific production commit while keeping later edits and tests, then requires a genuine assertion failure. Fresh current-target inverse executions have not been supplied to this review; historical reds are not relabeled as those new proofs.

## Device paths and producer/consumer compatibility

`phone creation refuses a leading dot and retries a dotted name (note/folder)` (qa12.spec.ts:5–27) intentionally skips desktop. It checks toast, unchanged route/visible heading, closed sheet, actual menu reopen, dotted-name creation and resulting route/heading. NameSheet.tsx:29–49 closes before source saving and navigates only after success, matching the authored retry path. Historical accessible-name mismatch was corrected to visible heading text without weakening product assertions; superseded failures remain retained.

The Timeline test covers both sizes. Folder rename uses the phone menu/dialog (:63–68) or desktop tree context menu/inline input (:69–74); returning to the note stays within the same source instance and its real rename journal (:77–80). It therefore tests former-name resolution, not an injected result or unresolved folder fallback. `the outline lists Bower's sections and sources link` (qa5.spec.ts:274) follows the PDF on both sizes, but only desktop continues substantive Outline assertions (:279–283); phone coverage must not be overstated.

Resolver direct-name lookup remains file-only (`features/note/resolve.ts:8–20`); existing formerNames mappings can resolve renamed folders. Typed display retains their dot suffix, and existing NoteScreen folder routing at :34 redirects to the Files route. No new folder resolver capability is claimed. Alias fixtures are minimal synthetic additions (demo/notes.ts:104–108). Existing fake seed serializes notes (fake/seed.ts:75); note-format.ts:108–125,179 preserves Timeline source aliases and extracts only link targets. No parser/backlink/schema change accompanies naming.

## Combined lifetime/recovery interactions

Current LiveSources retains stable facade/subscription identities while replacing scoped vault/run state; index.ts:72–75,140,154,187–195 guards epoch/disposal and current roots. Journal captures original owner before admission and retains durable/volatile A outboxes through scope replacement. The previous Minor disposed-listing/seen counterexample is fixed in the exact same production now integrated here. The renewed isolation report and three public synthetic probes at2244218 establish their bounded switch/late-effect/disposal cases; no real OAuth certification follows.

Task byte mapping (note-format.ts:185–206), pile structural/content prechecks, guarded run ordering/queued admissions, post-return foreground listing boundaries and request preflight before clearNew remain intact. The supplied isolation full check had517 tests/51 files, including existing19 run-order,16 foreground and17 request-preflight assertions. The integration isolation proof records its actual inverse assertion red and unchanged verify/check. No source regression was identified from composition with naming.

## Evidence and limits

Retained evidence: docs/harness/evidence/2026-10-05-qa12 contains original leading-dot four assertion reds, integrated historical demo/fake gates each196/56 intentional skips, original Timeline naked-label reds and revised dotted-folder reds/greens; prior Outline green belongs621ac55, not an ec9b0e7 rerun. qa13 preserves ordering/bytes/foreground/preflight evidence; qa14 preserves isolation rejected/revised reports, real public counterexamples/inverse observations and closure logs. These are implementer/coordinator executions, not reviewer runtime claims.

At report completion, fresh same-source combined check/demo/fake/PWA and supplemental actual phone/desktop evaluation have not been supplied as completed evidence. Independent live/native evaluation remains NOT RUN/unavailable in the retained capability reports. CLI or coordinator browser checks must remain labeled separately. The reviewer performed only Git/source/docs/log inspection and wrote this private report: no tests/builds/install/browser/provider calls, repository/shared-record edits, closure or delegation.

Unknown backend attempt/revision ordering, real OAuth/provider scope, arbitrary malformed aliases, duplicate-name resolution, protected rich ownership grammar, partial-pile readiness, report-save durability, O3 authority, R1–R4 and complete second-brain capabilities remain outside this bounded naming verdict. Existing open capability/recovery gaps are distinct from regressions in the two naming entries. P2 remains open regardless of proof counts.
