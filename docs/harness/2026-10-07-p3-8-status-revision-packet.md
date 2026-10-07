# Packet: worker-status-revision (P3-8, client half)

Starting model: `bower-implementer` (Sonnet). Reason: replacing the ticket order with the Worker's revision in the run source, with out-of-order tests ([TL-P3-15](2026-10-07-tl-p3-15-admission-and-revision.md) ruling 5). It starts after `worker-process-admission` is merged, because it needs `{ run, revision }` on the wire.

- **Entry:** `worker-status-revision`. Checkout `/private/tmp/bower-p3-revision`, branch `claude/p3-revision`, from the commit named in the prompt. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `src/data/live/runs.ts` (`issued`, `accepted`, `generation`, `take`, `refused`), `src/data/worker/worker-http.ts`, `src/data/worker/worker-api.ts`, `src/data/fake/fake-worker.ts`, `src/data/live/live.test.ts`.
- **Acceptance contract:**
  - **Run source.** `WorkerApi.status()` and `process()` give the revision with the run. `LiveRuns` keeps the highest revision it took.
    - It drops any answer below that revision, in place of the ticket order.
    - `start()`'s admission answer counts like any other.
    - The `generation` guard for disposal and admission stays.
    - The `refused` 4xx logic stays as it is.
  - **Fake Worker.** It answers `{ run, revision }`, with the revision rising on every run change.
  - **Named tests, red first:**
    - `an older status revision arriving last is dropped`: with the real source on a fake fetch, two `/status` asks whose replies arrive in reverse order keep the newer run state.
    - `the fake answers rising revisions`.
  - **Files in scope:** `src/data/live/runs.ts`, `src/data/worker/worker-http.ts`, `src/data/worker/worker-api.ts`, `src/data/fake/fake-worker.ts`, and their tests.
- **Gates:** the verify, `pnpm check` in full (quote its last line), and `pnpm e2e:fake` for `e2e/qa5.spec.ts`, `e2e/qa10.spec.ts` and `e2e/robustness.spec.ts` on private ports 5195–5198. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 12 lines:** commit SHA, red→green, gates, anything left out.
