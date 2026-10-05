# Independent immutable review: session-folder-isolation, replacement

Plan revision **2026-10-05-contracts-2**, **P2**, **C01/C14**, entry **session-folder-isolation**.

Base: `7c48f4d71290415a79e5bdc0b9b073407190eaa0`.
Replacement: `2244218c60f25ffa5f8991a905f52eba9f460199`.
Superseded candidate: `8bd67cdd77e3b3f32459b3708eccdf7d8bb80c8b`.
Prepared read-only checkout: `/private/tmp/bower-p2-journal-ack`, `codex/p2-session-isolation`.

**Verdict: no remaining actionable finding in the assigned immutable range.** The previous Minor disposal/storage finding is resolved within this replacement by inspected code, a genuine assertion red/green, and the coordinator's exact-target public reproduction rerun. This is an independent code-review verdict, not harness closure, general account-provider certification or P2 acceptance.

## Disposal correction

At `src/data/live/index.ts:72–75`, the common guard now rejects disposed Sources; the scoped active predicate at :140 includes disposal. The bound read postcheck at :167 rejects late read results. `src/data/vault/drive-vault.ts:125–127` independently rejects disposed vault continuations, so an awaited index cannot reach markSeen's global device-storage write. Public results and old Undo closures also encounter the common guard.

The exception at index.ts:103–115 is limited to LiveRuns.current's existing no-effect disposed snapshot behavior. LiveRuns.current itself returns its last state without requesting status when disposed. In `src/data/live/runs.ts:254–262`, report hydration tolerates a refresh refusal only after that run instance has been disposed; active hydration errors still propagate. No report read, refresh or admission is enabled by the exception. The original foreground disposal assertion remains unchanged.

Issued Drive mutations retain their successful result long enough to preserve original-owner bookkeeping: index.ts:165–168 still applies the post-result scope/disposal check only to reads. The retained Journal owner captured before queue admission remains bound to A, and its inactive post-effect path keeps the A outbox before refusing stale success. This avoids falsely claiming cancellation or forcing rollback.

Two actual assertions cover the correction in `src/data/live/live.test.ts`: `reused sources isolate account and folder changes (disposed pending listing cannot mark seen)` (:309), and `reused sources isolate account and folder changes (disposed late create retains original-owner bookkeeping)` (:202). The first holds an actual captured listing, disposes while refresh/seen await it, then checks null seen storage, both BowerError rejections, no notification, unchanged Drive snapshot and unchanged outboxes. The second holds a successful actual create reply, disposes, then checks the A effect remains, no subsequent Drive mutation/B publication, readable refusal and original-owner A outbox retention.

The complete red at 8bd67cd has **1 genuine assertion failure / 35 passes / 50 filter exclusions**, specifically a non-null seen value. The issued-create control already passes there; it is compatibility evidence rather than another claimed failing case. Replacement named green has **36 passes / 50 exclusions**. Supplied full check has **517 passes / 51 files**, with checking/build/harness gates complete. Logs: `/private/tmp/bower-session-isolation-dispose-{red-complete,green,check}.log`. These are supplied executions; the reviewer ran none.

## Full-range compatibility

The six permitted files remain the only changed files. The focused replacement changes index.ts, runs.ts, drive-vault.ts and live.test.ts; session.ts and journal.ts are unchanged from the independently reviewed 8bd67cd. The prior complete report `/private/tmp/bower-session-isolation-review-8bd67cd.md` retains the detailed source/test matrix and rejected finding history.

| Area | Rechecked conclusion |
| --- | --- |
| Session/account/folder lifetime | Fresh private vault/run state behind stable Sources identities; cached reads, creation placement, journal destination, old me/folder replies and same-folder new epochs remain guarded. Existing signed-out note/create/request assertions retained. |
| Authentication and device cleanup | Old auth replies cannot expire B; session.expire calls forgetThisPerson. Sign-out/deletion and failed lifecycle retry remain guarded. No auth/device policy or public wire changed. |
| Journal recovery | Owner captured before queue admission; durable and volatile folder-keyed outboxes retained, using original Drive identity for volatile memory. A lines are not replayed in B; fresh A can flush once without reactivating old promises. |
| Issued effects and uploads | Late applied create/task bookkeeping stays with A; no stale cleanup/trash, next upload, progress or publication in B. Unsent person upload bodies are released on scoped disposal. |
| Run admission and hydration | Fresh queues do not await old A admissions; old terminal hydration cannot publish in B; locks/seen reset. Existing 19 run-order and 16 foreground cases retain their substantive assertions and are included in the full check. |
| Other accepted foundations | No changes to task byte mapping, ownership grammar, structural/content prechecks, request preflight, file labeling or producer schemas. Related checks remain green in the supplied full gate. |

The sole approved existing fixture adjustment remains sessionStorage.clear beside localStorage.clear in `a run already going when the app opens is followed at the fast pace`; its delay and writing-phase assertion are preserved. New tests are controlled composed-source assertions over actual FakeDrive roots/bytes/effects, with explicit synthetic existing-wire identity stubs.

## Coordinator runtime evidence at replacement

All three independent public-call probes reportedly exit 0 at the full replacement SHA; the supplied results were inspected:

- `/private/tmp/bower-account-switch-2244218-results.json` and `.log`: B bytes, created note under B, saved journal under B, no new note in A.
- `/private/tmp/bower-account-late-effect-2244218-results.json` and `.log`: applied A effect remains; stale success is refused; A bookkeeping retained; B outbox/content clean.
- `/private/tmp/bower-dispose-seen-2244218-results.json` and `.log`: seen storage remains null; both pending read calls reject with readable unknown BowerErrors. This is the inverse of the actual 8bd67cd counterexample.

These are coordinator runtime observations, distinct from reviewer inspection. They exercise public synthetic Sources/FakeDrive calls and held real results, not OAuth, real providers or native UI.

## Limits

No tests, builds, browser/provider calls, source/shared-record edits or delegation were performed by the reviewer. The report alone was written to private temporary storage. No cancellation/rollback guarantee applies to issued I/O. No new event is required for addPile, which historically creates no journal record; incomplete-pile readiness and broader recovery remain separately open. Volatile waiting records do not establish durable reload recovery. Same-person/new-folder tests use sign-out/sign-in; they do not certify every provider folder-transition route.

Final combined check/demo/fake/PWA and affected independent/native evaluation remain coordinator work after integration. Unknown backend attempts/revisions, O3 authority, protected grammar, R1–R4 and full C14/P2 acceptance are not established by this candidate.
