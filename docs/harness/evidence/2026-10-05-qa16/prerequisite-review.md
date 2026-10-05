# Current-v1 recovery prerequisite review

2026-10-05. Independent read-only review by `/root/prerequisites_review`, assigned by the root coordinator. Plan **2026-10-05-contracts-2**, planning main **d12c55e**; P2/O3, C12/C14. Assigned integration source **cbf4e9f**; supplied prepared checkout **666074fb23ef9b858e02bf0bb15c7cbe621c54a0**. This is a prerequisite/reproduction and bounded proposal review, not an implementation candidate review, harness closure or phase acceptance.

## Outcome

**One Important current-product finding confirmed by inspection of genuine supplied public-call evidence; no additional Critical/Important/Minor defect found in the bounded repair proposal.** Registering a small test-first entry is justified. Implementation and its error handling remain unreviewed until an immutable candidate exists.

### Important — corrupt persisted state is accepted, and an unknown phase is overwritten

`src/data/fake/fake-worker.ts:190` casts parsed JSON to `Partial<LastRunFile>` and checks only `v === 1 && run`. It normalizes any nonterminal phase at lines193–201. Its inner catch at203 and constructor catch at50 log and consume errors, so malformed JSON resolves to idle rather than a readable refusal. `status()` at125–128 awaits the now-fulfilled initialization promise and returns the retained run or null. `process()` at112–122 uses the same initialization path and has no retained load-failure guard.

The final supplied test/logs have **3 valid controls and 10 genuine assertion failures, 13 total, no skips/setup failures**. Each invalid failure is specifically the expected public FakeWorker.status rejection versus actual resolution; later byte-preservation assertions were not reached. DriveVault.lastRun rejects all10 with BowerError unknown and `Bower could not read its latest update. Try again.`, preserving original bytes and full snapshots. The actual unknown-phase record separately demonstrates **one Drive mutation**: `waiting` becomes `failed`, the original literal/trailing newline is replaced, and new phaseAt/finishedAt/reload explanation are written. It is not an additional counted assertion failure. Other synthetic text and the independently validated pending current-v1 journal record remain unchanged.

The malformed JSON, array container and unsupported v2 resolve null. Missing/empty ID, negative requestedAt and fractional total return invalid terminal wire. Two malformed report cases resolve done while the invalid report remains stored; stripping the report from the returned wire does not make its durable source valid. These are mismatches between current consumers, not a need for a future schema or report producer.

Evidence: `assertion-red-final.log`, `valid-controls-final.log`, `observed-summary.json`, `observations.json`, independent literals under `fixtures/`, and `reproduction.test.mjs` in the reviewed packet. I inspected these; I did not execute them.

## Existing contract compatibility and repair requirements

The existing `isRunnerFile(SYSTEM.lastRun, value)` guard in `src/data/vault/layout.ts:102–108` already verifies an object v1 envelope, `isRunWire` and the optional report shape. `isRunWire` rejects blank IDs, invalid scopes/phases, negative/nonfinite timestamps and invalid totals. This is the guard already used by DriveVault.json at673–689. Reusing it before copying or normalizing any persisted run is compatible with the supplied minimal done, failed and valid-report/additive controls. Optional report absence and inert additive fields remain allowed. That parser compatibility does not certify useful completion or report-save durability.

The assignment should require the following concrete implementation behavior:

1. Parse as unknown, apply the shared existing guard before setting `this.run` or invoking any recovery write. Syntax/shape refusal logs diagnostic details and retains a short BowerError for the person. Invalid original bytes and full snapshot remain untouched; no normalization, deletion, new run or scenario auto-start follows this refusal.
2. Handle initialization failure immediately and retain a failure state. Merely removing the inner catch leaves the outer constructor catch swallowing the refusal; merely leaving `loaded` rejected risks an unhandled rejection before a caller arrives. A fulfilled handled initialization promise plus a stored failure checked after its await by both public status and process is a viable minimal design. Do not clear the refusal implicitly when process is retried. Preserve existing transport/offline errors rather than relabeling every failure as malformed data. No new wire field or externally invented failed run is required.
3. Keep missing-file behavior normal. Validate before applying the existing legitimate active-phase reload policy. Queued/reading/writing/saving remain valid input and may receive the existing failed-after-reload treatment; saving must retain its truthful partial-movement wording. This entry should not change that policy into a scheduler or resume protocol. Ensure `scenario: running, fresh: true` cannot fall through to `start` after invalid persisted input.
4. Refused public calls must be readable rejections before FakeWorker dispatch, not null/idle success or only console output. Tests must allow initialization to settle before calling status to expose constructor rejection mistakes. Check no unhandled rejection, zero Drive mutations and exact bytes/snapshot after status and attempted process. LiveRuns.start reaches worker.process after flushing its journal; therefore this bounded proof is **no Worker dispatch**, not a broader claim that no preceding application operation can write anything.
5. Recovery is explicit: archive original unreadable bytes, deliberately repair a copy through public writeText using the modifiedTime just read, and reconstruct a fresh FakeWorker before retry. Supplied evidence demonstrates that fresh-instance read succeeds and preserves repaired state in all13 cases. It does not demonstrate same-instance cached-error recovery, automatic repair, a new UI retry flow, or successful dispatch after repair. Do not promise those without explicit scope and proof.

## Recommended reservation and proof paths

Reserve one writer for `src/data/fake/fake-worker.ts` and `src/data/fake/fake-worker.test.ts`. An optional literal-only shared fixture helper should be explicitly named in the assignment if adopted; no DriveVault/layout/WorkerHttp production change is needed to fix this mismatch.

Preserve the proposed named verify prefix:

```sh
pnpm vitest run src/data/fake/fake-worker.test.ts -t "persisted v1 run fixtures agree across current recovery consumers"
```

Before production edits, record genuine owned-test red against the assigned base. Include independently specified literal valid controls and the same10 invalid durable cases across public DriveVault/fresh FakeWorker; status and process refusal with an actual pending input/change, zero Worker admission/data effects, intact original bytes/full snapshot, handled delayed initialization, and explicit read-version repair followed by fresh-instance retry. Require dispatch after repair to work if that behavior is claimed, in a separate disposable synthetic world so preserved original evidence is retained.

Add missing-file, all four legitimate active-phase reload controls, terminal done/failed and inert additive metadata. Current fake-worker.test.ts covers reading/saving reload wording, a cut-short real fake run and running-scenario fresh:false; it does not by itself explicitly cover all queued/writing or the invalid-file fresh:true auto-start refusal. Preserve those existing controls, the existing first run/report, fail-once retry and no-work refusals. Full selected file and required gates remain coordinator obligations after a registered candidate; I did not run them.

Keep report-save-barrier, scheduler/attempt IDs, readiness, new wire grammar, real Worker behavior and P3/P4 implementation separate. WorkerHttp validates its HTTP RunWire wrapper via isRunWire; this review does **not** claim HTTP validation of the durable v1 envelope or report.

## Immutable identity and limits

- Report `/private/tmp/bower-run-v1-reproduction.md`: **9321 bytes**, SHA-256 **f16beada73db0091309c93446a78c21c020b819af33787e0832600629c019c29**.
- Manifest `/private/tmp/bower-run-v1-reproduction/packet-hashes.json`: SHA-256 **9ded345f3f688a088755f8cc4c569d8fee0b077cd268a9e5121d28b94ffebb77**.
- Independently read and hashed **all26 listed packet files**: byte lengths and hashes match; no mismatch. Inspected supplied2 syntax checks, not executed here.
- All24 loaded source hashes recorded in observations match both current integration data source and prepared checkout data source when read during this review; no Git operation used. The assigned SHA identities themselves are coordinator-supplied.
- Principal source hashes: fake-worker.ts **e5659e4446c97027046ee9b6026173529960f00fd1ebfb9895ff60f556d1456f**; drive-vault.ts **677783824f07e10aaa1089e3c9c152e9ad2280be862869eb046567747ff073c5**; layout.ts **9487e04defe7444bf596fef63d1485100db81ff309af2589e244972bedcf5376**; worker-api.ts **47122565b9b44759d313743cc698090c921c23af69a8273be2127ed12404e1ad**; fake-runner.ts **80c86052a376705620431ff333017ce4cff65a2266605da7431ec7924c3dd396**.
- Supplied reproduction calls status/lastRun only, never process. No process-dispatch prevention, fixed green, browser, real Drive/Worker, durable report publication or user recovery workflow has been demonstrated by this packet. Original first observations/test/logs are preserved and the final validated-journal/current-version repair refinements do not weaken the invalid-status expectation.
- No reviewer test/build/init/module execution, browser/provider/network, private credential/config access, Git action, source/shared-record edit, delegation, closure or phase decision. The only reviewer write is this new scratch report. Root must register/assign any next entry before a product writer begins it.
