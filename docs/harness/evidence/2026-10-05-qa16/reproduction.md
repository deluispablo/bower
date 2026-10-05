# Current-v1 last-run consumer reproduction — no production fix

2026-10-05. Plan **2026-10-05-contracts-2**, main d12c55e; P2/O3 C12/C14. Parent's immutable integration target **cbf4e9f**. Prepared read-only checkout `/private/tmp/bower-p2-journal-ack`, clean **666074fb23ef9b858e02bf0bb15c7cbe621c54a0** at orientation. Sole assigned implementer `/root/google_setup_rework`; root is sole shared-record writer/integrator. Scratch-only reproduction; no entry registered/closed by worker and no fix delivered.

## Verified finding

**Important: current durable consumers disagree; fresh FakeWorker accepts corrupt/unsupported last-run data and can overwrite it.** The same literal fixture bytes were installed through public FakeDrive.createText and copied into identical snapshots through public FakeDrive.restore. Public DriveVault.lastRun rejects all10 invalid cases with BowerError unknown, `Bower could not read its latest update. Try again.`, preserving exact full snapshot and file bytes. A fresh FakeWorker({fresh:false}).status resolves for every case:

| Literal case | Observed FakeWorker.status | Exact snapshot/bytes |
| --- | --- | --- |
| Malformed JSON, array container, unsupported v2 | Resolves null; no readable refusal | Unchanged |
| Missing/empty id | Returns terminal wire lacking/empty id | Unchanged |
| Unknown phase waiting | Returns newly failed wire with fresh phaseAt/finishedAt and a reload failure explanation | **One mutation, changed original bytes and full snapshot** |
| Negative requestedAt, fractional total | Returns invalid terminal wire | Unchanged |
| Malformed report question, nested created array | Accepts done and strips report from returned wire | Invalid original report stays stored; no refusal |

No report producer or future grammar is needed to demonstrate this. The unknown-phase input is literally:

```json
{ "v": 1, "run": { "id": "RUN_A", "scope": "all", "phase": "waiting", "requestedAt": 1, "phaseAt": 2 } }
```

Its original trailing newline, exact resulting failed-file bytes, metadata timestamps, mutation count and before/after snapshots are retained in `observations.json`; original fixture bytes in `fixtures/unknown-phase.json`. `observed-summary.json` is a readable machine summary. Allother text files, the synthetic inbox item and the validated current-v1 pending change record remain identical. No new run/report was dispatched by this script: no process call, fresh:false, only status/lastRun. This is **not** a runtime guarantee that a later process call after malformed recovery cannot dispatch; that needs a future explicit assertion.

## Public fixture execution and genuine assertions

The in-memory source loader uses the checkout's already prepared TypeScript runtime to transpile modules to CommonJS in memory. It changes no source file and calls no private methods. Its allowlist confines runtime source to src/data/*.ts; each loaded file must be byte-identical to the integration copy before execution. All24 loaded module hashes are retained in `observations.json`. Map-backed synthetic local/session storage supports existing public APIs; no browser/provider/service or real data is used. Diagnostics are captured as synthetic local evidence, not swallowed by the test.

Three independent literal valid controls ran first:

```sh
node --test --test-name-pattern='\(valid-' reproduction.test.mjs
```

Actual exit0 **3pass/0fail/0skip**, `valid-controls-final.log`: minimal v1 done without optional report; failed with short failure; done with a valid report/one created effect entry/requests/rulesWorded and inert additive metadata. DriveVault returns the complete envelope; FakeWorker strips report and retains inert run metadata. Both preserve exact bytes/snapshots with0 mutations. Minimal no-report acceptance is current parser compatibility, **not** useful-completion/report-barrier acceptance.

Then full public-call test:

```sh
node --test reproduction.test.mjs
```

Actual exit1 **13tests:3pass/10fail/0skip/0cancelled**, `assertion-red-final.log`. Each invalid fixture reaches the genuine Node AssertionError `fresh FakeWorker.status must refuse the same invalid durable bytes visibly`, actual resolved versus independently specified rejected. There are no module/setup/bind failures. These10 failures are refusal assertions; the unknown-phase overwrite is separately directly observed in stored bytes/snapshot/mutation count, not falsely counted as an additionally reached failing assertion. Original and corrected scratch-test observations/logs are preserved separately.

Fixture expectations are literal test data independent from producer helpers; no isRunnerFile result is used as the expected last-run outcome. Final pending journal fixture is independently literal current-v1 and checked against existing public isJournalRecord before setup. First logs used an unvalidated preservation sentinel and an original-state repair copy; final logs use a validated journal record and repair the **actual post-status snapshot**. These bounded fixture refinements changed no production or expected last-run assertion and both reproductions show the same10 mismatches. `observations-first.json`, `assertion-red-first.log`, `reproduction-first.test.mjs` preserve the first reproduction honestly.

Both current scratch modules pass node --check, `syntax-check.json`. No pnpm check/Vitest/browser suite/build/init/install was run; none is claimed green by this reproduction.

## Explicit failure and recovery observation

Each test archives original literal bytes/snapshot before either consumer. After capturing the actual FakeWorker post-read snapshot, a separate copy is deliberately repaired with the known valid-done literal using **the modifiedTime just read** through public get/writeText. Fresh public consumers both return the repaired RUN_A/done, preserve the repaired snapshots and leave input/change record untouched in all13 cases. The test asserts this before its expected invalid-worker refusal assertion. Read versions and repaired bytes/results are retained per case.

This shows version-correct deliberate fixture repair permits reading again, not automatic recovery or safe rewriting of corruption. Unknown-phase normalization destroys the invalid source text in the app's stored file; our outside-app archive retains it. An actual user recovery should preserve unreadable input before correction and avoid replaying effects; no UX/retry flow was built or evaluated here. Missing-file fallback and legitimate active-run reload policy are separate historical controls, not malformed-data permission.

## Exact source identity

The loader verifies integration equality for every loaded module. Principal SHA-256 values:

| Source | SHA-256 |
| --- | --- |
| src/data/fake/fake-worker.ts | e5659e4446c97027046ee9b6026173529960f00fd1ebfb9895ff60f556d1456f |
| src/data/vault/drive-vault.ts | 677783824f07e10aaa1089e3c9c152e9ad2280be862869eb046567747ff073c5 |
| src/data/vault/layout.ts | 9487e04defe7444bf596fef63d1485100db81ff309af2589e244972bedcf5376 |
| src/data/worker/worker-api.ts | 47122565b9b44759d313743cc698090c921c23af69a8273be2127ed12404e1ad |
| src/data/fake/fake-runner.ts | 80c86052a376705620431ff333017ce4cff65a2266605da7431ec7924c3dd396 |

## Proposed bounded next entry — requires root registration/assignment

Use existing validation rather than inventing a version/phase/schema. Minimal production scope: `src/data/fake/fake-worker.ts`; before accepting/casting/normalizing existing durable data, apply the shared current `isRunnerFile(SYSTEM.lastRun, value)` guard and propagate a logged readable BowerError for syntax/unsupported shape. Ensure constructor/load handling does not swallow that refusal before public status/process. Normalize only already validated legitimate active phases, preserving existing reload policy as distinct O4 history. Missing last-run remains normal.

Minimal tests: extend `src/data/fake/fake-worker.test.ts` with the named public cross-consumer fixture group; optional small literal fixture helper `src/data/contract/fixtures/run-v1.ts` if root prefers reuse. DriveVault already behaves correctly; its production changes are unnecessary. Proposed unchanged verify after root adopts paths:

```sh
pnpm vitest run src/data/fake/fake-worker.test.ts -t "persisted v1 run fixtures agree across current recovery consumers"
```

The test should cover valid controls first, exact same invalid bytes across DriveVault/fresh FakeWorker, readable refusal/unchanged original file+full snapshot, no dispatch after refused load, explicit read-version repair/retry and existing legitimate active reload controls. Current wire HTTP RunWire-only checks remain separate; WorkerHttp was not executed here and must not be asserted to validate durable envelope/report. No report-save-barrier, protected grammar, readiness, dispatch-id/attempt or scheduler change is included.

Root next records the reproduced finding, registers a bounded entry/verify, and explicitly authorizes a test-first minimal fix. Independent immutable review, required local checks and root integration/proof remain pending. This scratch observation establishes neither O3 acceptance nor P2 completion. No checkout/product/Git/shared-record mutation, provider/browser/credential access, delegation or closure.
