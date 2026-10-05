# Independent revised foreground-refresh review

Assignment: `external-change-refresh`, planning revision `2026-10-05-contracts-2`, P2, C03/C14. Immutable range `af902661bc6929189f7a673ca17ce8dd86f25853..1d6fe32e6bd9dd972f54a0806482d8ec6b76cbf6`; rework inspected against `50d918f5bb944be91854a3069e1341cb6dd047c2`. Only `src/data/live/runs.ts` and `src/data/live/live.test.ts` changed. Reviewer inspected immutable Git source/diffs and supplied logs; no test/build/browser/provider execution, delegation, or repository/shared-record edits.

**Verdict: no remaining actionable findings within the assigned bounded packet. The prior Important finding is resolved within this candidate by source inspection and supplied controlled assertion evidence. This is an independent candidate verdict, not integration closure or full C14 acceptance.**

## Prior finding and correction

The old candidate counted refresh completions. A listing that captured metadata before a visible return could finish during that wave and suppress fresh discovery. The coordinator's independent public-call probe reproduced old note text and a missing added note on exact `50d918f`; that runtime evidence remains attributed to the coordinator, not this reviewer.

At revised `src/data/live/runs.ts:156`, the foreground wave snapshots `refreshIssued`. Each new refresh increments this issue ticket at `:181`; successful completion records that ticket at `:183`. The foreground loop at `:161` continues until a successful refresh issued after the wave boundary has completed. Finishing or joining a pre-wave refresh therefore cannot satisfy discovery. The next iteration checks disposal and current accepted active state at `:162` before starting a fresh listing. Failed refreshes release their pending promise and the foreground event logs its failure, allowing a later return to retry. Same-wave refreshes still coalesce through `refreshing`, and repeated visible events share `foreground`.

Two actual new assertions use a wrapper that calls the real list first, captures its snapshot, and only then holds resolution. Another client completes real text and added-note writes before hidden→visible; the old snapshot is released afterward. Exact names:

- `returning to an idle folder refreshes external changes (pre-return snapshot cannot satisfy terminal discovery)`
- `returning to an idle folder refreshes external changes (pre-return snapshot cannot satisfy idle discovery)`

Both inspect fresh note text, added-note visibility and exactly two listings. Supplied `/private/tmp/bower-foreground-refresh-prewave-red.log` records both as stale-text assertion failures against `50d918f`, with 14 other named passes and 34 filter exclusions. This is a real red rather than a listing-count-only or setup failure. Revised green includes both cases.

The two additional cases `returning to an idle folder refreshes external changes (pre-return listing wait rechecks active before starting discovery)` and `(pre-return listing wait rechecks disposed before starting discovery)` preserve the accepted new run/locks or disposal and verify no second listing. They passed on the old candidate too; their value is guarding the new deferred-listing continuation, not establishing an old defect.

## Full-range checks

| Assigned area | Inspected support |
| --- | --- |
| Discovery and protected bytes | The original two-client shared-backend assertion uses distinct typed DriveApi façades, actual visibilitychange, real writes, stale cache preconditions and fresh text/tree outcomes. Its full backend snapshot remains unchanged by discovery, including the CRLF protected-source fixture; no process call is made. New overlap cases extend that evidence. |
| Coalescing | `(completion shares discovery and cached status does not relist)` and `(completion joins an already pending discovery)` remain unchanged. A listing issued after the foreground trigger may satisfy that wave; cached status does not repeatedly relist. Repeated visible events coalesce and a later completed wave permits another discovery. |
| Status cadence and recursion | Ordinary status/current/timer paths remain status-only apart from existing first-terminal report hydration. Their named assertion remains unchanged. Vault refresh emits data changes; existing useLoad reloads reads rather than redispatching visibility. No per-poll full listing or refresh recursion is introduced. |
| Pending work/source identity | The same DriveVault/Journal instances survive; refresh only invalidates and rebuilds the listing promise. `(waiting journal, upload and Undo survive discovery)` preserves outbox bytes, a pending rule, upload placeholder and Undo. No journal flush/content mutation is added by discovery. |
| Errors/auth/retry | Existing watchAuth expires session and rethrows; foreground failures log and release the wave. Offline/auth listing tests retain outbox bytes, avoid a false vault emission and retry successfully on a later return. This is simulated auth evidence, not real OAuth proof. |
| Admission/disposal | Existing status-wait admission assertion preserves newer locks and skips discovery. Existing full-source disposal during status/listing tests remain; added pre-wave wait cases check the new continuation. In-flight network operations are not cancelled. |
| Report/state ordering | Report hydration still uses the coalesced refresh and retains generation/current-ID checks after awaits. The original ticket, generation, phase, eligible-null and serialized-admission code is unchanged from the accepted run-order base. All 19 run-order assertions remain present and are included in the supplied full check. |
| Content conflicts | `(a later external write still refuses a stale checkbox edit)` preserves the existing modifiedTime refusal and remote bytes. Discovery adds no content writes. |

## Supplied proof and limits

`/private/tmp/bower-foreground-refresh-prewave-green.log`: 16 named passes, 34 filter exclusions. `/private/tmp/bower-foreground-refresh-prewave-check.log`: 51 files and 464 tests passing, successful lint/type/build checks. Original core/extended red and green evidence remains retained. This reviewer read those results and did not run them.

No revised execution of the coordinator's standalone probe was supplied or claimed; the candidate's two controlled assertion cases directly cover its captured-old-list mechanism. No native/manual/browser evaluation, live Drive/Worker service, authoritative backend revision/attempt ordering, account-isolation certification or provider atomicity is established. External edits during an already coalesced wave and later changes after a fresh listing remain outside a transaction guarantee; the bounded promise is discovering changes completed before the foreground trigger through a listing issued after that trigger. Protected ownership grammar, report-save recovery and full C14/O3 authority remain separate open concerns.
