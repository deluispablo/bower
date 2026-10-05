# Independent review: pile-context-version

Verdict: **No Critical, Important or Minor correctness findings in the assigned candidate.** The registered stale-existing-context entry is met by inspection and supplied assertion evidence. Coordinator integration/proof closure remains required; this is not complete C02/C03/C14 or P2 acceptance.

- Reviewer: independent Codex `/root/o1_audit`, `p2-context-review-2026-10-05`, separate from builder.
- Planning/phase/capabilities: `2026-10-05-contracts-2` / P2 / C02,C03,C14.
- Exact range: `afb4b3633388e8c09132f2b9b3b6387c2295b3c2..dc45b035b41b1b63ef05cddaac37996c2d2fb62d`.
- Read-only checkout: `/private/tmp/bower-p2-journal-ack`, clean branch `codex/p2-pile-context`, HEAD matched target. Refreshed live integration ACTIVE and canonical role instructions already loaded.
- Changes: only `src/data/vault/drive-vault.ts` and `src/data/vault/drive-vault.test.ts`; no public schema/provider contract/shared records/screens/proofs modified.
- No reviewer tests, builds, installations, browser use, source edits or delegation. Only authorized temporary review report written.

## Checked behavior

| Requirement | Result / reference |
| --- | --- |
| Existing context version before first effect | `drive-vault.ts:458–463` resolves the cached context by old pile path, reads fresh metadata and rejects unequal modifiedTime before any conversion-folder create, move, rename, content write or Bin operation. Existing pile name/place guard at 457 remains first. |
| Context removal protected | Empty input follows same precheck, then `:482` trashes only context that passed it. A stale context present before precheck remains live and unchanged; no stale clearing/partial rename. |
| Captured note survives folder rename | The captured note identity/parent folder ID does not change when the folder name changes. Moving lookup before rename therefore preserves the correct target and its cached content version. Lone-item conversion still has no existing context note and follows prior creation behavior. |
| Later write version remains | `:480` still passes note.modifiedTime to writeText. New test injects a content mutation after the precheck, inside the write call, and confirms conflict with late remote context preserved. |
| No-effects proof | Parameterized empty/different-text cases compare entire FakeDrive snapshot, including Bin and metadata, after stale conflict and verify newer context bytes remain. It detects silent clear and rename-before-write-conflict separately. |
| Refresh/retry | Mismatch initiates refresh at `:461` and returns readable conflict. Named regression explicitly awaits refresh then retries successfully for both write and removal. It does not claim refresh timing was synchronously awaited by the rejection itself. |
| Ordinary success/input bytes | Existing `editing a pile accepts unchanged name and place (%s)` (lone/folder) remains green in full check: input content-only changes and top-level modifiedTime changes are allowed; context edits/clear work; input bytes retained. Existing `editing a pile keeps the context content version check` remains green. |
| Error/ownership compatibility | Uses established BowerError conflict message and metadata precheck model; no new schema, global lock, storage or atomicity claim. Existing auth/not-found/offline errors propagate before side effects when get fails. |

## Supplied proof evidence and honesty

Unchanged verify: `pnpm vitest run src/data/vault/drive-vault.test.ts -t "stale pile context refuses every effect before write or removal"`.

- `/private/tmp/bower-pile-context-red.log`: two genuine failed assertions, not load/install errors. Empty-text case resolves instead of rejecting; different-text case rejects for stale content but whole Drive snapshot differs because folder rename already happened. This is exactly the independently reproduced baseline defect.
- `/private/tmp/bower-pile-context-green.log`: both named cases passed, 56 unrelated tests skipped by targeted selection.
- `/private/tmp/bower-pile-context-check.log`: 51 files / **412 tests passed**, TypeScript/build/sensors complete; includes new late-write test `editing a pile still checks context versions at the content write`. Preexisting bundle-size warning remains.
- `/private/tmp/bower-pile-context-init.log`: supplied exclusive writer baseline completed.

Reviewer read logs; no reviewer gate execution. Worker feature counts in its older base do not establish current integration status or closure.

## Limits explicitly retained

The precheck is not atomic with later effects. An external mutation after the metadata check may still race a Bin/rename operation; a late write conflict may follow a structural effect when derived name changes. The late-write test deliberately keeps derived name fixed and proves content protection, not a global transaction. These are existing provider/recovery boundaries, not solved or newly introduced here; R1 remains required.

The assignment covers an existing cached context note. Concurrent creation of a new context where the cache showed none, remote context disappearance, externally altered structure after the check, multiple-client real-provider observations and complete recovery were not freshly reproduced or tested by reviewer. No unsupported claim of exactly-once or all-races safety. No screen changes/manual evaluation occurred. The frozen candidate can be integrated for its bounded entry; wider pending foundations and ownership decisions remain open.
