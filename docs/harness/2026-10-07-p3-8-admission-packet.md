# Packet: worker-process-admission (P3-8)

Starting model: `bower-escalated` (Opus). Reason: admission, idempotency, quota and expiry in one synchronous section of the person object. This is the C12 core ([TL-P3-15](2026-10-07-tl-p3-15-admission-and-revision.md), TL-P3-14).

- **Entry:** `worker-process-admission` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-admit`, branch `claude/p3-admit`. Never push or deploy.
- **Read:**
  - `docs/harness/WORKER.md`, this packet, `docs/harness/2026-10-07-tl-p3-15-admission-and-revision.md`, and the `/process` and `/status` rows plus the `RunWire` block of `docs/specs/2026-10-04-worker-contract.md`.
  - Api: `api/src/person.ts`, `api/src/person-schema.ts` (the v1 `admission`, `quota` and `control` tables; `SCHEMA_VERSION` 6), `api/src/status.ts`, `api/src/session-lease.ts` (`requireLease`), `api/src/index.ts`, `api/test/session-lease.test.ts` and `api/test/status.test.ts` as patterns.
  - App: `src/data/worker/worker-http.ts` (`process`, `status`, `isRunReply`, `isStatus`), `src/data/worker/worker-api.ts` (`RunWire`, `isRunWire`), `src/data/live/runs.ts` (`start`), `src/data/fake/fake-worker.ts` (`process`, `runs.ids()`).
  - Reuse: the original app's `/Users/deluisp/Projects/bower/api/src/process.ts` (`runStaleness`, `markStale`, `QUEUED_STALE_MS`, `RUNNING_STALE_MS`), adapted to the person object.
- **Stub first** for new modules.
- **Acceptance contract:**
  - **`POST /process`:**
    - Guards: `requireSameOrigin`, `requireSession`, `requireLease`, then a JSON body `{ scope: "all" | "instructions", allowWeb: boolean, requestId }`.
    - `requestId`: 1–64 characters of lowercase letters, digits and dashes. A missing one counts as new, so the Worker makes one.
    - A body that fails validation answers 415 `unsupported-media-type`.
    - Named test: `process needs the session epoch`.
  - **In one synchronous section of the person object** (no `await` inside), in this order:
    1. **Expiry.** If the current run is stale, mark it `failed` once, raise the revision, and go on. Queued is measured from `requestedAt` against 17 min; any other active phase from `phaseAt` against 30 min. Its `failure` is "This tidy-up took too long and stopped. Try again.", and its `finishedAt` is now.
    2. **Idempotency.** If `requestId` matches a stored request, return that request's run, whether it is still going or ended, with no count and no change. The first request's scope and allowWeb win.
    3. **Active run.** If a run is active, return it, with no count and no change.
    4. **Quota.** The counter for today's UTC date: at or above `DAILY_RUN_LIMIT`, answer 429 `rate-limited` with nothing written. Otherwise count it.
    5. **Admit.** Admit a `queued` run (`id`, `scope`, `requestedAt`, `phaseAt`) bound to the requestId, and raise the revision.
  - **Schema v7:** a runs table keyed by run id, with a unique request id, scope, allowWeb, phase, times, total and failure. Keep a bounded history (for example the last 20 runs), with a comment. The control row's `status_revision` rises on **every** write to runs and never otherwise. Include a tested v6→v7 migration that keeps every row.
  - **Answers:** `POST /process` and `GET /status` both answer `{ run: RunWire, revision }` (`run` may be `null` on `/status`). `/status` applies the same expiry write first. Replace the stand-in `currentRun()` body.
  - **Named api tests** (in `api/test/process.test.ts`, plus `status.test.ts` where natural):
    - `admission is idempotent by requestId`: same id → same run (also after it ended); the first scope wins.
    - `one active run per person`.
    - `the daily quota refuses past the limit and counts only new runs`.
    - `a stale run is marked failed once and raises the revision`: two `/status` calls past 17 min → one write, one raise.
    - `process and status answer the revision`.
    - `process needs the session epoch`.
  - **App half:**
    - `LiveRuns.start` makes one `requestId` per call (`crypto.randomUUID()`, lowercased, which already fits) and `WorkerHttp.process` sends it.
    - The fake Worker uses the given requestId and returns that request's run on a repeat.
    - Reply validators accept the extra `revision`. Using it is `worker-status-revision`'s job.
    - Named test: `each tidy-up press sends one requestId`.
  - **No dispatch:** an admitted run stays `queued` until `worker-dispatch`. Errors from the person object answer 500 `internal` with no cause.
  - **Files in scope:**
    - api: a new `api/src/process.ts`, `api/src/status.ts`, `api/src/person.ts`, `api/src/person-schema.ts`, `api/src/index.ts`, and their tests;
    - app: `src/data/worker/worker-http.ts`, `src/data/worker/worker-api.ts`, `src/data/live/runs.ts` (the requestId only), `src/data/fake/fake-worker.ts` (requestId only), and their tests.
- **Out of scope:**
  - 409 `nothing` (waits for `spine-admission-manifest`; the app's own guard stays);
  - dispatch, runner tickets and stale recovery tuning;
  - the client's use of `revision`;
  - UI copy beyond the one failure sentence.
- **Gates:** the verify (red first on assertions), `pnpm check` in full (quote its last line), and `pnpm e2e:fake` for `e2e/qa5.spec.ts` and `e2e/robustness.spec.ts` on private ports 5195–5198. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 15 lines:** commit SHAs, red→green, the migration evidence, gates, sources, anything left out.
