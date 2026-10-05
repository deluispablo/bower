# External-change refresh prerequisite

Independent read-only recommendation. Exact integration target: `28d2ce2359a940f2e2d25b4f58af04636dd15a7b`; planning revision `2026-10-05-contracts-2`, P2, C03/C14, qa-13 `external-change-refresh`. This proposes a bounded candidate under the existing public interfaces. It does not adopt architecture, execute a regression, certify provider guarantees, or close the entry/C14.

## Evidence and diagnosis

The registered assertion is **`returning to an idle folder refreshes external changes`**, verify `pnpm vitest run src/data/live/live.test.ts -t "returning to an idle folder refreshes external changes"`. It is planned and unexecuted at this target (`harness/features.json:2561–2572`).

The coordinator's earlier O1 reproduction on production `143ae2b` found `before: Old text`, `reopened: Old text`, `afterStatusPoll: Old text`, `treeContainsRemote: false`. Durable evidence is `docs/harness/evidence/2026-10-05-o1/probe-results-143ae2b.txt`. That reproduction is separate from this source inspection; the relevant refresh/status behavior remains unchanged at the target.

- `src/data/live/runs.ts:35–45,100–112`: visibility returning to visible invokes the same poll as the timer. Ordinary polls call `current()`. The timer asks status every 4 seconds active/60 seconds otherwise.
- `runs.ts:72–75,116–128`: current reads Worker status; Drive refresh occurs only on first observation of a terminal run needing report hydration. Idle/null and an already hydrated terminal run never discover external changes.
- `src/data/vault/drive-vault.ts:117–121,616–628`: refresh invalidates the index, awaits a new `listAll`, then notifies vault listeners. A failed index promise resets itself, so another attempt can retry. Ordinary `tree()` and `note()` reuse that index.
- `drive-vault.ts:665–670,762–768`: text and parsed-note caches are keyed by file ID and listed modifiedTime. A fresh index discovers new notes and causes changed notes to be read again. Clearing every content cache on each poll is unnecessary under the existing modifiedTime contract.
- `src/data/provider.tsx:29–67,69–79`: `useLoad` reloads subscribed vault reads on notification and retains last good displayed data while loading/errors. Its reload button only calls the source read; it does not invalidate the cached Drive index. Sequence checks are per hook, not a shared refresh coordinator.
- `src/data/live/index.ts:54–98`: sources own one vault/Journal and LiveRuns, wrap Drive/Worker auth refusals via `watchAuth`, and flush waiting journal lines at startup/online. Disposal removes online and visibility handlers and vault/run listeners. Recreating sources for refresh would replace local pending upload/Bin/Journal state and is unsuitable.

## Smallest supported scope

Use the existing **document visibility return** as the supported discovery trigger. Keep ordinary status polling and consumer `runs.current()` calls status-only. A private foreground operation in LiveRuns can ask current status, and, when the accepted state is idle/null or terminal, refresh this same vault before settling the operation. Keep the existing run-completion refresh path. No public Worker schema, new provider method, UI refresh promise, or automatic background Drive polling is necessary for this entry.

Make this an explicit foreground path rather than adding unconditional `vault.refresh()` inside `current()` or `take()`. Run notifications cause subscribers to call current again; putting refresh there can cause repeated listings. A vault refresh must notify vault subscribers, not emit a fictitious run transition to trigger another refresh.

Bound one foreground wave with a shared in-flight promise/private flag released in `finally`. Concurrent visible events join it; hidden events do nothing. If this wave's run-completion hydration already successfully refreshed the vault, do not perform a second sequential list for the same wave. A small private refresh-success counter/helper shared with terminal hydration, or an internal result describing that operation, can establish this without changing RunSource. Do not treat some unrelated previously completed refresh as satisfying a later return. A failed wave must allow the next return to retry.

Recheck accepted active state and lifecycle after awaits. A new run admitted while foreground status/report reads wait must retain its locks and ordering. Do not assign a captured stale reply to shared run state solely to decide whether to list Drive. The separately scoped `run-status-monotonic` prerequisite covers that existing run-order defect; if this candidate adds overlapping asynchronous work, its relevant race must be proved or explicitly serialized. A visibility event during an active run can continue normal status polling and rely on completion hydration; the registered case is an idle folder. This does not claim discovery of every external edit continuously while a run is active.

The existing DriveVault refresh is sufficient for sequential idle discovery. Do not expand into a generalized cache rearchitecture. If concurrent foreground/completion refreshes are allowed, coalesce them locally and inspect that no older listing is published as the accepted index. Concurrent mutations holding an old index are a broader existing race; avoid asserting atomic refresh/write coordination without a real regression and assigned scope.

## Preserve pending work, errors, and lifetime

Refresh must retain the original vault and Journal object, pending upload maps, Bin/Undo state and local/volatile outbox. It only reads the root/list and emits. Do not flush, remove, acknowledge or reconstruct journal lines as a side effect of discovery. `journal.ts:230–257` merges listed immutable records with waiting records; changing the index does not authorize dropping local waiting data. Existing startup/online/start flush rules remain.

Use wrapped Drive calls so `auth` still expires the session through `watchAuth`; do not consume errors as a successful refresh. Visibility has no awaiting caller, so the event operation catches and logs its failure once using the existing poll convention, releases its in-flight guard, and leaves retry possible. Preserve last displayed hook data; a subsequent user load retains the normal BowerError path. Do not claim the background error is automatically rendered as a new vault-wide error: there is no such source channel in the current API. New source-level error propagation would require separate scope.

Disposal removes the listener and timer and prevents a queued/in-flight foreground continuation from initiating another refresh, scheduling work or notifying subscribers after disposal. Existing Drive requests lack cancellation; do not invent an abort guarantee. Check disposed state before beginning post-status work, and avoid reintroducing listeners on settlement. Sign-out/auth lifetime and account isolation remain wider pending contracts; do not turn cache retention into a promise that old-account data is safe across source changes.

Fresh reads do not relax content `modifiedTime` or name/place `stillAsSeen` safeguards. A second external edit after discovery must still refuse a stale content write and preserve remote bytes. Refresh merely updates what the client sees; real provider precondition atomicity remains R1, unproven.

## Real regression packet

Author the exact named test in `src/data/live/live.test.ts` and capture its actual baseline assertion failure before production edits. Use the real `makeLiveSources`, DriveVault/index/caches and idle FakeWorker. Worker status remains null; process is never called. Subscribe to vault updates as the screen does, and use a controlled completion signal rather than arbitrary sleeps.

**Fixture honesty:** FakeDrive owns a private per-instance store (`src/data/drive/fake-drive.ts:23–38`). Two separately constructed/restored FakeDrives are independent replicas and cannot demonstrate shared external edits. Build two distinct typed DriveApi client façades forwarding public calls to one actual FakeDrive backend; create separate client/source caches over those façades. Alternatively two sources may share the backend directly, matching the existing `first changes on separate clients are all visible after refresh` test, but do not label that as two independent FakeDrive stores. No fake private-store mutation or new production FakeDrive feature is needed.

A caches an existing synthetic note body/tree. B, through its client, performs an actual `get`/`writeText` with modifiedTime and `createText` adding a new note in the same folder. Before return, assert A still has cached text and lacks the added note, establishing the stale setup. Set document visibility hidden then visible and dispatch the actual `visibilitychange` event; never call `vault.refresh()` directly in the regression. Await the vault notification/reload. Assert A now reads B's exact fresh body and sees the added path; Worker remains idle and process count is zero. Add a protected Current state/Timeline fixture with unchanged supported bytes and personal task content to prevent discovery from becoming serialization.

Suggested additional exact assertions, all **planned**, not executed:

| Named test | Actual observable assertion |
| --- | --- |
| `idle status reads do not repeatedly list the folder` | After priming caches, repeated current calls and ordinary idle timer ticks add no listAll calls; the visible return adds one foreground discovery list. |
| `visible returns share a pending folder refresh` | Hold the real listAll via a deferred wrapper; repeated events do not overlap full listings; settle, then a later return can discover another change. |
| `foreground refresh keeps waiting journal changes` | Create a genuine waiting journal record by refusing journal createText; snapshot folder-scoped outbox bytes and changes; return/refetch without flushing; record remains visible exactly once and storage unchanged. |
| `a failed foreground refresh can be tried again` | Fail listAll offline; assert one logged failure and no fake successful notification; restore Drive and dispatch another return; new note/text arrive. |
| `foreground Drive auth refusal expires the session` | Fail listing with auth via wrapped API; assert session notification/current refusal behavior and no outbox deletion. |
| `disposed sources ignore a pending foreground return` | Hold status before refresh, dispose, resolve; no new list/notification/timer. Also dispatch a post-disposal event: no requests. |
| `returning after a completed run lists the folder only once` | Foreground observation of a new terminal run shares the completion refresh; subsequent cached terminal current reads do not list again. |

Preserve existing real assertions: `a run walks the phases and ends with its report`, `a failed run carries its sentence and leaves the inbox`, `a run already going when the app opens is followed at the fast pace`, `Drive refusing the person sends them to sign in`, both named `outbox: a waiting line goes ...` tests, `toggleTask rejects on a stale modifiedTime`, and `a rename or move of something changed elsewhere writes nothing`. New scheduling/generation work also needs the run-order suite once assigned.

## Handoff limit

Recommend a narrowly assigned candidate in runs.ts/live.test.ts first; index.ts only if lifecycle ownership requires it, with explicit coordinator scope. Foreground discovery of external changed text/new notes under current modifiedTime semantics is supportable without a new wire. This does not establish offline reading policy, background synchronization, browser-independent accepted work, backend authoritative ordering, unknown timestamp behavior, provider atomicity or full C14 recovery. Technical-lead service guarantees and their runtime evidence remain pending.
