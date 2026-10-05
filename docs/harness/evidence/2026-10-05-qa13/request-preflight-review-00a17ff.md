# Independent runner request-history preflight review

Assignment: `runner-request-preflight`, planning revision `2026-10-05-contracts-2`, P2, C11/C14. Exact immutable range `64d5e3d052794d8fb63e2f45da274ce64e3038e6..00a17ff374893dc79dd156789ab8ba677e4115f5`. Only `src/data/fake/fake-runner.ts` and `src/data/fake/fake-runner.test.ts` changed. Reviewer read immutable Git source/diffs, related app consumers and supplied logs. No tests, builds, browser, providers, delegation or repository/shared-record writes performed.

**Verdict: no actionable findings within the assigned bounded packet. Suitable for coordinator integration and required closure gates. This is not phase acceptance, general recovery certification or full C14 proof.**

## Inspection

| Requirement | Candidate references and assessment |
| --- | --- |
| Preflight before first direct mutation | `fake-runner.ts:79` constructs a fresh Writer listing, `:80` reads journal, `:81` validates existing requests, and only then `:82` calls clearNew. This unconditional placement applies to both scopes and no-pending-request runs. Filing, rule writes, archive and hashes follow. No request-dependent condition can bypass validation. |
| Existing v1 compatibility | Requests-specific helper at `fake-runner.ts:301` parses into unknown and calls existing `isRunnerFile(SYSTEM.requests, value)` at `:312`. Layout/schema remain unchanged. `layout.ts:78`–`:85`, `:102`–`:107` retain v1, array container, required strings and finite timestamps, optional per-record completion, and additive-field acceptance. Empty strings and fractional/negative finite timestamps remain supported. Missing actual file returns null. |
| Readable safe refusal | Syntax and unsupported shape produce fixed path/category diagnostics and `BowerError('unknown', 'Bower could not read its latest update. Try again.')` at `fake-runner.ts:307`–`:315`, matching app behavior at `drive-vault.ts:647`–`:662`. Raw input and parse exception contents are not logged. Non-SyntaxError Drive read failures are rethrown unchanged. |
| Completion safety/compatibility | `doRequests` at `fake-runner.ts:237`–`:241` uses the same guarded helper; existing missing/empty behavior, prepending completion and 20-record cap remain. Old records retain their additive fields. The existing top-level reconstruction may omit additive header fields on valid completion; that unchanged behavior is not advertised as byte preservation. Content writes still use the modifiedTime held by the Writer listing at `:322`. |
| Refused domain snapshot | `fake-runner.test.ts:220`–`:243` builds public FakeDrive/DriveVault fixtures with a pile, pending request or rule, old new-mark, existing Bin entry, and absent destination/archive/hash paths. `:255` checks exact full snapshot equality, `:256` checks raw malformed bytes, `:257` checks mark, and `:262`–`:264` checks fresh app refusal plus unchanged snapshot. FakeDrive snapshot includes metadata, parents, content, trashed flags and counters (`fake-drive.ts:45`–`:53`), so equality catches creates, moves, trash, mark clearing and byte changes. |
| Versioned repair and retry | `fake-runner.test.ts:267` repairs using the actual current modifiedTime. `:268`–`:289` verifies successful retry, correct scope filing, prior history retention, one completion per pending request, journal archive once with exact original bytes, then a second full run with no duplicate filing/completion/archive. Instructions retry leaves the pile for the subsequent full run. |
| Unchanged wider semantics | Generic JSON helper for questions/hashes remains unchanged at `fake-runner.ts:288`–`:297`; no public file schema, scheduler, provider or checkpoint architecture changed. Existing runner tests remain included in supplied full check. |

## Named evidence

The exact regression prefix is `malformed request history stops a tidy-up before effects`. Its 12 refusal cases combine `all`/`instructions`, pending request `true`/`false`, and `syntax`/`nested record`/`container` (test generation at `fake-runner.test.ts:246`–`:247`). Cases assert both BowerError type and user sentence, exact fixed diagnostic and absence of `SYNTHETIC_PRIVATE_HISTORY` in logged calls. Phase collection is explicitly checked as queued/reading/writing/saving.

Four positive assertions remain compatible:

- `malformed request history stops a tidy-up before effects (valid missing history remains compatible)`
- `malformed request history stops a tidy-up before effects (valid empty history remains compatible)`
- `malformed request history stops a tidy-up before effects (valid optional completion remains compatible)`
- `malformed request history stops a tidy-up before effects (valid additive fields and finite timestamps remains compatible)`

`malformed request history stops a tidy-up before effects (Drive read failures propagate)` at `fake-runner.test.ts:309` checks identity of an injected existing offline error plus unchanged domain snapshot.

Supplied `/private/tmp/bower-request-preflight-red-complete.log` has 13 actual assertion failures and four positive passes, with 18 filter exclusions, before production correction. Invalid syntax/nested input incorrectly resolves done; invalid container rejects with incidental TypeError rather than BowerError; the read-failure case already propagates the error but fails snapshot equality because earlier effects occurred. These establish real failure behavior, not import/setup failures. The final inspected fixture also includes an existing Bin entry; the recorded red snapshots shown in the log precede that fixture strengthening, so they are not separately claimed as a Bin-specific red.

`/private/tmp/bower-request-preflight-green.log` reports all 17 named cases passing, 18 filter exclusions. `/private/tmp/bower-request-preflight-init.log` reports baseline 464 tests; `/private/tmp/bower-request-preflight-check.log` reports 51 files/481 tests passing with successful lint/type/build checks. Reviewer inspected these results without executing them.

## Limits

The refusal snapshot proves direct runner domain safety with collection-only phase callbacks. FakeWorker's existing onPhase writes last-run telemetry before this preflight (`fake-worker.ts:143`–`:148`), and its catch persists failed status afterward; no unchanged-service-telemetry claim is made. FakeWorker error presentation/scheduler code remains unchanged and is not exercised by these new direct-runner cases.

The helper rereads requests when completing them, but the first preflight is not a transaction: externally malformed/removed/changed data introduced later can still stop a run after earlier effects; existing modifiedTime write refusals remain the bounded safeguard. No rollback, mid-run-corruption recovery, request dedupe for a lost effect response, report-save durability, browser-independent execution, unassigned questions/hashes validation, live-provider guarantee or new wire contract is established. These limits preserve the prerequisite's scope rather than closing broader C11/C14 recovery obligations.
