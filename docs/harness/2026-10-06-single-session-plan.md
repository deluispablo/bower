# single-active-session plan (read-only Claude planner, at `c43daf6`)

Planning input for entry `single-active-session` (qa-25, TL-P2-13). Not yet an assignment: S1 waits for U1 (closed), readiness and upload-queue phase 2 to integrate.

- **Model:** place id per tab in `sessionStorage` (`bower:place`); lease per person `{holder, epoch, beatAt}`, epoch strictly increasing on each take or re-grant after expiry. New `leaseEpoch`, not the existing page-lifetime epochs.
- **Worker call:** `session(place, 'check'|'take'|'leave') → {active, epoch}` next to `me()`; `WorkerHttp POST /session` mocked only (real endpoint P3). No RunWire field.
- **Fake lease:** `src/data/fake/fake-lease.ts`, localStorage `bower:lease:<source>:<email>`, TTL 3 min, heartbeat 30 s, injectable clock; `FakeWorker.process()` refuses `conflict` from a non-holder place.
- **Tab detection:** `src/data/session.ts` `PlaceGuard` with injected lease, Web Locks (`ifAvailable`, `steal`), BroadcastChannel `bower:session`; Use here = `take` → steal lock → broadcast; old tab blocks without disposing (upload bodies survive); new place runs refresh → run hydrate → upload-queue start → outbox flush.
- **Fence:** `guard.fence()` in the fail-closed `bound()` Drive proxy (`live/index.ts:175`) for every non-read method (covers DriveVault, journal, readiness declarations, upload queue client); `fenceWorker` for `process`/`createFolder`; flush at start and on `online` only after `verify()`. Runner keeps raw drive (never fenced). Demo: `fenceDoors()` wraps mutating sources.
- **UI:** `Gatekeeper` renders only `<OpenElsewhere/>` when the place is elsewhere: `PoseBower pose="wait"`, h1 "Bower is open in another window.", primary "Use here", error in `role="alert"`.
- **Sub-units:** S1 lease + fence (data layer; verify `session.test.ts -t "one active session per person fences the old place"`), S2a screen + gate (`OpenElsewhere.test.tsx`), S2b wiring + e2e (`e2e/qa25.spec.ts` demo + fake, phone + desktop, axe).
- **Questions for the lead:** TTL/heartbeat and silent acquire after expiry; `POST /session` contract shape (P3 obligation); per-write lease check vs short cache in P3; source kind in the lease key; should a blocked place stop polling `status()`.
- **Do not claim:** real Worker lease, cross-device fencing beyond a shared fake lease, recall of an in-flight Drive write, fencing of the runner or external editors, shared Drive/run visibility between fake pages.

## TL-P2-14 answers (main `6af8ba6`)

1. TTL 3 min / heartbeat 30 s. A live lease always asks "Use here"; an expired lease is taken without asking. Best-effort `leave` on pagehide, TTL is the fallback. An offline holder returning after expiry gets the block screen and its outbox waits.
2. `POST /session {place, action} → {active, epoch}` approved as a P3 obligation: holder `check` refreshes `beatAt`, `take` raises the epoch; place is a random per-tab id with no secret, bound by the Worker to the authenticated person; the Worker enforces the epoch on `process`, `createFolder`, `deleteAccount` (stale epoch → one plain error). Drive writes are fenced by the app (accepted limitation).
3. P3: 5 s cache, not a call per write; fresh check before outbox flush, before each upload starts and before `process()`. BroadcastChannel makes in-browser takeover immediate.
4. Lease key includes the source and, for fake, the scenario; real uses the authenticated person, not the email.
5. A blocked place stops polling `status()`, its heartbeat and every background job; the screen covers the content; Use here takes the lease and reloads data in full.
