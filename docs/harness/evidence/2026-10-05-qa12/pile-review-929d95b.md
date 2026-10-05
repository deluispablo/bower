# Independent review: pile-edit-still-seen

Verdict: **No correctness findings introduced by the candidate; the registered stale name/place entry is met.** Coordinator may proceed with normal integration/proof closure. Adjacent existing context-concurrency limits below remain outside this entry and must not be presented as complete C02/C03/C14 acceptance.

- Reviewer: independent Codex `/root/o1_audit`, session `p2-pile-review-2026-10-05`, separate from builder.
- Planning/phase/capabilities: `2026-10-05-contracts-2` / P2 / C02,C03,C14.
- Exact range: `786948933fcc24a69d09981dbaa670088b266080..929d95b686bdc8034d96f055e0da359c95fcc489`.
- Checkout: `/private/tmp/bower-p2-journal-ack`, clean `codex/p2-pile-seen`, HEAD matches immutable candidate. Live integration ACTIVE packet refreshed.
- Diff: `src/data/vault/drive-vault.ts` and `src/data/vault/drive-vault.test.ts` only. One production line; no public schema, ownership contract, screen, shared record or proof changes.
- Read-only inspection and supplied evidence only. No reviewer tests/builds/install/browser/source edits/delegation. Only this authorized temporary report written.

## Findings and behavior

No Critical, Important or Minor candidate regression found.

`DriveVault.updatePile` now calls `stillAsSeen(f)` at `src/data/vault/drive-vault.ts:457`, after resolving the cached top-level pile and before every structural/context side effect. That includes lone-item conversion-folder creation at 463, parent move at 465, folder rename at 469, context write at 475 and context removal at 477. It uses the established name/first-parent contract (`stillAsSeen` at 735–740), allowing unrelated content-only changes while refusing stale name/place and triggering refresh. It does not replace content write's existing modifiedTime check.

The six named conflict cases cover lone item versus folder, name versus parent changes, and folder context clearing. Each compares the entire FakeDrive snapshot before/after rejection and asserts no folder create: remote metadata/content and other Drive files remain unchanged. The test caches the pile before the remote mutation, so it would detect moving the precheck after a side effect. The old folder-parent/nonempty path additionally failed with not-found after its bad side effect; this is still a genuine assertion red against the intended conflict/no-write behavior.

Positive tests `editing a pile accepts unchanged name and place (%s)` exercise both representations, remote input-byte changes plus changed top-level modifiedTime, edited context, subsequent context removal and preservation of remote input bytes. `editing a pile keeps the context content version check` observes a stale context write conflict and unchanged remote context. Existing create/conversion/restore/run restrictions are unchanged. No broad modifiedTime rejection was introduced for harmless input content changes.

## Supplied proof evidence

Unchanged verify: `pnpm vitest run src/data/vault/drive-vault.test.ts -t "editing a pile refuses external name or place changes"`.

- `/private/tmp/bower-pile-seen-red.log`: six **failed assertions**, not missing modules or infrastructure failure; five resolved instead of expected rejection, one returned wrong not-found instead of conflict. 49 unrelated tests skipped by targeted selection.
- `/private/tmp/bower-pile-seen-green.log`: all six named cases passed.
- `/private/tmp/bower-pile-seen-check.log`: 51 files / **409 tests passed**, TypeScript/build/sensors complete; includes the new positive and existing-version regressions. Preexisting bundle-size warning remains.

Reviewer did not execute these gates. They are worker evidence; coordinator still owns combined proof closure.

## Adjacent existing concerns and limits

Reasoned from unchanged surrounding code; not reproduced by reviewer and not candidate regressions:

- `src/data/vault/drive-vault.ts:476–478`: A caches a folder pile/context, B changes only Pile note.md content, A clears context. Top-level name/place passes, then context is binned without checking cached note.modifiedTime. The newest context remains recoverable in Bin, but the stale clearing action removes it from the pile without a conflict. Reproduce separately and clarify/version-check content removal before counting complete context concurrency recovery. The added nonempty-content test does not cover this branch.
- `:466–475`: after another client's context-text edit, a nonempty edit with a different derived folder name can rename the folder before the later content-version check refuses write. The new version-check test deliberately retains the derived name, so it establishes content-byte preservation, not absence of all structural side effects on a content conflict. Reproduce separately if the desired operation contract promises that stronger property.

Those observations do not invalidate the targeted name/place fix. Avoid broadening this candidate into multiple defects without a separate assignment/proof.

The check/read → write gap remains the existing real-provider R1 premise; this local precheck is not an atomic external-Drive transaction. A remotely deleted pile propagates existing not-found behavior; unrelated auth/offline failures propagate unchanged. No real-provider observations or manual phone/desktop work occurred. P2/C02/C03/C14 and phase closure are not certified by this entry.
