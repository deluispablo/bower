# Independent foreground-refresh review

Assignment: contracts-2/P2/C03,C14, external-change-refresh. Exact immutable range `af902661bc6929189f7a673ca17ce8dd86f25853..50d918f5bb944be91854a3069e1341cb6dd047c2`. Only `src/data/live/runs.ts` and `src/data/live/live.test.ts` changed. Source references below refer to candidate Git objects. Reviewer inspected source/diffs and supplied evidence; ran no tests, builds, browsers or providers and made no repository/shared-record edits.

**Verdict: changes requested. One Important finding; no other actionable finding identified within this bounded packet. No integration or phase acceptance.**

## Important: a pre-return listing can satisfy the foreground discovery wave

Refs: `src/data/live/runs.ts:155`, `:161`, `:177`–`:182`, `:240`; existing `src/data/vault/drive-vault.ts:117`–`:120`, `:616`–`:628`, `:665`–`:669`.

`refreshed` counts successful completion, not when a listing was issued. A terminal status request can start a listing before the visible return. That listing can capture metadata, remain pending, and then finish after another client has completed an edit and added a note before the return. The foreground `current()` joins the pending terminal hydration; the old listing increments `refreshed`, so the wave skips a listing issued after the return. If current status becomes idle instead, `refreshFolder()` can directly join the same pre-existing listing. In either case, the wave has no freshness boundary tied to its trigger.

With old metadata retained, the note cache still has the matching old modifiedTime and returns the old text; the old tree does not contain the added note. This fails the assigned return-to-foreground discovery behavior for edits already completed before its trigger. It is a local overlap bug, not a claim about provider atomicity or a hypothetical write occurring after refresh.

The coordinator actually reproduced the terminal-listing case on exact `50d918f` using public FakeDrive/DriveVault/LiveRuns, synthetic EventTarget visibility events and a `listAll` proxy that captures the real listing before holding resolution. The second client's real write/create precede hidden→visible. `/private/tmp/bower-foreground-preexisting-list.log` records AssertionError exit 1: expected `Remote text`, got `Old text`; the results JSON also records `treeContainsRemote: false`. Script: `/private/tmp/bower-foreground-preexisting-list-probe.cjs`; results: `/private/tmp/bower-foreground-preexisting-list-results.json`. The reviewer inspected this script/log/result; did not independently execute it. The subsequent note-presence assertion is not reached after the first assertion fails, although the recorded observation establishes the missing tree entry.

Current named assertions `returning to an idle folder refreshes external changes (visible events share one pending wave and later returns retry)` at `live.test.ts:673` and `(completion joins an already pending discovery)` at `:814` hold the promise **before** calling the real listing. They prove call coalescing for a listing begun by the foreground wave, not an old captured listing initiated before it. The core two-client assertion at `:633` covers an uncontended return.

Required rework: give a foreground wave an issue-time freshness boundary. A refresh initiated before that wave must not discharge its discovery obligation merely by finishing during it. Awaiting the old refresh then initiating one fresh listing is a bounded approach; coalesce listings initiated for that same wave. Retain error retry, later waves, disposal checks and accepted active-run admission checks after relevant awaits. Avoid new wire/schema or backend ordering claims.

Require an actual named assertion red against this exact candidate before correction, using a wrapper that captures old metadata first, then another client's completed text edit/addition, then visibility return, then release. Assert both fresh text and added-note visibility after the wave, not only listing count. Also cover eligible idle status while old hydration is pending and preserve the existing same-wave completion coalescing case.

## Remaining packet inspection

| Area | Candidate support and limits |
| --- | --- |
| Ordinary discovery | Core two-client test uses distinct typed DriveApi façades over one FakeDrive backend, real writeText/createText and actual visibilitychange; cached stale text/tree first, fresh text/tree afterward, one subscription reload, no backend bytes changed and process not called. Protected CRLF fixture remains exact. |
| Status cadence and recursion | Ordinary `current()`/timers remain status-only except existing first terminal hydration. `useLoad` reads data on source emission (`provider.tsx:46`–`:61`); vault refresh emits once and does not dispatch visibility events. The status-only and cached-terminal assertions bound repeated listings. |
| Local pending work | Same DriveVault/Journal objects survive refresh; refresh replaces only the listing promise. Waiting journal/upload/Undo assertion at `live.test.ts:695` preserves outbox bytes, pending rule, upload placeholder and restoration. It is a synthetic bounded case, not full recovery certification. |
| Auth/offline retry | Existing watchAuth wrapper (`live/index.ts:36`–`:47`) expires session and rethrows. Foreground event catches/logs failures, releases wave and schedules retry. Offline/auth assertion at `live.test.ts:724` checks one diagnostic, no false vault emission, outbox bytes unchanged and later successful return. No real OAuth/provider proof. |
| Disposal/admission | New-admission-during-status test at `:757` preserves new locks and skips discovery. Dispose during status/listing cases at `:774` prevent later event/poll activity and notifications through full Sources disposal. In-flight network operations are not cancelled. |
| Existing run ordering | Ticket/generation/phase guards and post-await accepted-state report checks remain intact. All 19 previously added ordering/admission/null/disposal assertions remain in this candidate and are included in the supplied full check. No unknown cross-device revision/attempt authority is established. |
| ModifiedTime safety | Later remote-write/checkbox assertion at `:833` still refuses stale content and preserves remote bytes. Foreground discovery performs no content writes or journal flush. |

## Supplied proof and limits

The initial core log `/private/tmp/bower-foreground-refresh-red.log` has one real stale-text assertion failure. Extended red has 10 failed, 2 passed and 34 filter exclusions; failures are assertions, not import/setup failures. `/private/tmp/bower-foreground-refresh-green.log` has 12 named passes and 34 filter exclusions. `/private/tmp/bower-foreground-refresh-check.log` reports 51 test files/460 tests passing and successful lint/type/build checks. These supplied greens do not cover or erase the coordinator's captured-old-list counterexample.

No browser/native/manual assessment, real Drive/Worker service, account-isolation certification, authoritative revision guarantee, protected ownership grammar, report-save recovery or full C14 acceptance is provided. The only requested source correction is the bounded freshness/coalescing issue above; the reviewer did not broaden the public contract or implement it.
