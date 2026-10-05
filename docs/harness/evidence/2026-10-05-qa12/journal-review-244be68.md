# Independent review: journal-ack-content

Verdict: **No Critical, Important or Minor correctness findings in the assigned candidate.** Candidate meets the registered entry by inspection and supplied assertion evidence. This is not entry closure or P2 acceptance.

- Reviewer: independent Codex `/root/o1_audit`, session `p2-journal-review-2026-10-05`, separate from implementer.
- Planning/phase/capabilities: `2026-10-05-contracts-2` / P2 / C11,C14.
- Exact range: `143ae2b12d5440330bee1a85bd16e90b8dccf746..244be6838ba67bf93aca58e712b1c8198cdaf4a0`.
- Read-only checkout: `/private/tmp/bower-p2-journal-ack`, branch `codex/p2-journal-ack`, clean status, HEAD matched immutable target.
- Live integration ACTIVE records this assignment. Loaded canonical session/review skills earlier; refreshed ownership/target for this review.
- Diff contains only `src/data/vault/journal.ts` and `src/data/vault/journal.test.ts`. No public interfaces, producer schema, harness/proofs or shared records changed.
- No reviewer tests, installs, builds, browser use, source edits or delegation. This report is the only authorized temporary-file write.

## Behavior checked

| Requirement | Review result / source |
| --- | --- |
| Fresh direct/archive discovery | `journal.ts:188` calls `files(true,true)`; unchanged `DriveVault` callback at `drive-vault.ts:92–97` freshly rebuilds from Drive. `VaultIndex.journalFiles(true)` at `vault-index.ts:55–62` includes all actual-name duplicate `.bower`/`changes` folders and archives, excluding folders themselves. |
| Fresh contents despite warm journal cache | `journal.ts:199` always calls Drive readText instead of `this.read`. Added direct/archive test warms list cache before mutating contents, asserts read and fresh listing. |
| Complete immutable equality | `journal.ts:200–204` validates v1 JournalRecord, compares all defined waiting fields, rejects missing/extra/mismatching fields, and tolerates JSON whitespace/key order. Schema fields are primitive; strict value equality is appropriate. Undefined optional fields are omitted as JSON serialization omits them. |
| All copies, including valid plus invalid | `journal.ts:197–209` validates every matching filename, without stopping on first valid. Any invalid/unreadable duplicate rejects before marking that record sent. This is inspection evidence; new test creates one copy per case, not simultaneous mixed duplicates. |
| Retained waiting data on failed read/mismatch | Catch at `journal.ts:205–207` logs diagnostics and throws readable BowerError before final keep at 213. No pending data is removed on that path. Earlier successful sends in the same batch remain pending if a later copy fails; next flush reconciles their exact Drive copies, avoiding logical loss/duplicate create. This multi-record partial-error path is inspected, not directly tested by new regression. |
| Exact lost-response dedupe | Existing copies avoid send at `journal.ts:210` after validation; test ends with exact reordered/whitespace JSON, successful flush, cleared outbox, no create and unchanged remote bytes. Existing lost-response tests remain in green full check. |
| Error propagation/callers | Required flush rejects, so LiveRuns.start awaits it before process. Ordinary record catches a failure to flush older work, preserves that work and can still send the new change; existing storage/volatile fallback remains unchanged. Error class/message are plain and logs retain cause. |
| Scope/compatibility | No v1 field/type/interface changed; comparison now enforces complete immutable contents as assigned. Foreign added fields under existing filename fail confirmation conservatively rather than silently claiming an equivalent record. Future schema migration remains separate serialized work. |

## Supplied test evidence and red honesty

Unchanged verify: `pnpm vitest run src/data/vault/journal.test.ts -t "waiting changes require matching valid Drive contents"`.

- `/private/tmp/bower-journal-ack-red.log`: both parameterized direct/archive cases failed **assertions** at test line 81, `promise resolved undefined instead of rejecting`; not a load/import/install failure. This matches base code trusting filename and removing pending data.
- `/private/tmp/bower-journal-ack-green.log`: both named cases pass, ten unrelated tests intentionally skipped by targeted selection.
- Added case enumerates malformed JSON, wrong shape, missing device, mismatches to every stored field and missing optional removes; for each it asserts pending bytes retained, fresh read/listing, remote bytes unchanged and no create. Final exact-copy case asserts dedupe.
- `/private/tmp/bower-journal-ack-check.log`: 51 files / **400 tests passed**, TypeScript/build/sensors complete. Expected injected error diagnostics appear; output also retains the preexisting bundle-size warning.
- `/private/tmp/bower-journal-ack-init-network.log`: supplied installation/init baseline completed. Reviewer did not execute any command that runs tests or builds.

## Coverage limits / set aside

The new regression does not directly inject readText rejection, simultaneous valid+invalid same-name copies, multiple exact copies, or a later-record failure after an earlier successful send. Inspection supports safe behavior for those branches; do not claim they were executed. Additional assertions could strengthen regression protection without changing production behavior.

No real Drive visibility/consistency/permissions or external-edit races were observed. Full-record confirmation cannot promise that an external actor will not mutate/remove a confirmed file later; immutable journal ownership and R1/R2 provider evidence remain separate boundaries. No browser/manual screen gates were run, appropriate to this data-only candidate scope. This review does not certify all C11/C14, durable execution, other open findings, P2 closure or future schema migrations. Coordinator must integrate and perform its normal proof closure before recording the entry passed.
