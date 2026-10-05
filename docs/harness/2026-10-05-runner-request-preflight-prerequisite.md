# Runner request-history preflight prerequisite

- Assignment: `p2-request-preflight-prep-2026-10-05`; planning revision `2026-10-05-contracts-2`, P2, C11/C14, `runner-request-preflight`.
- Immutable inspected source: `6dda1a4909271126331c2d35c83bf0593bc51c99`. Runner/layout have no changes relative to the O3 observation source `6305ca9dfa126fd08ef9fe819a4ba2000cb78437`.
- Status: source-derived implementation recommendation only. No tests, builds, browser, providers, repository or shared-record writes performed. This does not adopt a contract, close an entry, or accept C14.

## Recommendation

Add a requests-specific read/preflight on the fresh `Writer`, using the existing `isRunnerFile(SYSTEM.requests, value)` v1 guard, immediately after journal reading and before `clearNew`. Apply it in both run scopes and even when this journal contains no requests. Keep the existing public file schema and other runner JSON behavior unchanged.

`runFake` constructs its fresh writer at `src/data/fake/fake-runner.ts:79`, reads the journal at 80, and first directly mutates data at 81 through `clearNew`. Filing, moving piles to Bin, rules, request completion, archive and hashes follow. A check only inside `doRequests` at 236–240 is too late. The earlier reader may have a listing cached before phase delays; use the writer's fresh listing for this preflight.

Read JSON as `unknown`, then narrow with the existing guard. A missing file is normal empty history. Malformed JSON or an unsupported shape must throw a short `BowerError`, with fixed path/category diagnostics rather than raw history or parse-error content. Other Drive errors must propagate instead of becoming empty history. `DriveVault.json` at `src/data/vault/drive-vault.ts:647` provides an existing error-handling precedent. Reuse this behavior without extending the generic runner JSON helper to unassigned questions or hashes.

A requests-specific guarded helper can also replace the unchecked `json<RequestsFile>` read in `doRequests`. Initial validation still belongs before `clearNew`; a later guarded read alone cannot prevent earlier effects. Keep writes using the modifiedTime in the writer's listing. This is a bounded preflight against observed malformed input, not an atomic transaction: a new external change after validation can still meet the existing write conflict checks after earlier effects. No new checkpoint, provider guarantee, revision, cache architecture or wire format is implied.

## Existing compatibility boundary

`src/data/vault/layout.ts:47` defines `RequestsFile`; the helpers at 76–85 and `isRunnerFile` at 102–110 already define acceptance. Top-level `v` must equal 1 and `done` must be an array. Each record requires string `id`/`text` and finite numeric `at`; its `done` string is optional. Unknown additive fields are accepted. Empty strings and finite fractional or negative timestamps are accepted by the current guard; a preflight must not silently tighten those rules. Missing actual requests files, empty history, records without optional `done`, and additive fields remain accepted. Null, invalid versions, invalid containers, invalid required fields and invalid present optional fields remain rejected under that guard.

Acceptance of additive fields does not promise their universal byte preservation during valid completion. Existing completion rebuilds the top-level `{v, done}`, retains old record objects and caps history at 20. Preserve that behavior; the required exact-byte preservation applies to refused malformed input. Do not infer a new public preservation contract.

## Evidence and failure mechanism

The supplied durable report, results and script in `docs/harness/evidence/2026-10-05-o3/` observe a public FakeDrive/DriveVault/direct-runner scenario. Valid control completes normally. Existing invalid JSON is silently treated as missing by the runner's generic helper at 287–296, so completion replaces its bytes. Invalid nested records are preserved as invalid records while being reserialized and prepended with completion. A non-array history produces `TypeError: old is not iterable` only after the pile was filed and removed from the inbox. In all three malformed cases the app's existing guarded read refuses the file.

The script is an observation that exits successfully, not an assertion red. It did not execute FakeWorker, browser, retry, concurrent writers or R1. In particular, direct `runFake` invokes phase callbacks before this writer preflight; the real fake-service wrapper can persist phase telemetry through those callbacks. A no-effects assertion with collection-only callbacks establishes no direct runner domain mutations, not that every service telemetry byte stays unchanged. Existing report-save recovery concerns remain separate.

## Required concrete assertions

Implement the registered exact regression `malformed request history stops a tidy-up before effects` as meaningful cases for invalid JSON, invalid nested required fields and non-array `done`. Its name in the harness is planned, not yet executed.

Use public FakeDrive/DriveVault setup: an inbox text pile, a pending request and an existing file carrying a new mark. Corrupt only existing requests history with its actual modifiedTime, then snapshot all Drive files, bytes, metadata, parent/name/Bin state and marks plus pending intent. Direct `runFake` must reject with `BowerError` rather than complete or fail with an incidental TypeError. Compare the entire snapshot unchanged, including request bytes, pile, journal, old new-mark, absence of new destination folders, archive and hashes. A fresh guarded app read must still refuse those same unchanged bytes. Fixed diagnostics must not contain a distinctive synthetic content marker.

Add valid missing-history, empty-history, optional-record-`done` and additive-field controls under the existing guard. Include the no-pending-request path so the preflight cannot be hidden behind `asked.length`. Repair the malformed file with a real modifiedTime write and retry: assert one filing, completion once, prior valid entries retained under the existing cap, and pending journal archived once. Keep ordinary full and instructions-only successful behavior covered by existing named assertions such as `files every pile it took and empties the journal`, `marks what it filed as new, and only that`, `a request is done after the run, and the inbox waits for a full tidy-up`, and `failOnce leaves the inbox as it was`.

The writer must obtain actual assertion reds against its immutable base before correcting production. No result above is implementation proof. Later external malformation after preflight, general runner recovery, questions/hashes corruption, report durability and authoritative backend ordering remain unproven and outside this bounded recommendation.
