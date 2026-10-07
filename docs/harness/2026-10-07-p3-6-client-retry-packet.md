# Packet: client-retry-policy (P3-6)

Starting model: `bower-implementer` (Sonnet). Reason: a behaviour fix across the run source and the Drive client, with a cause to find first ([TL-P3-10](2026-10-07-tl-p3-10-r2-result.md) ruling 3).

- **Entry:** `client-retry-policy` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-retry`, branch `claude/p3-retry`. Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `src/data/live/runs.ts`, `src/data/live/index.ts`, `src/data/provider.tsx` (`useLoad`, `useRun`), `src/data/worker/worker-http.ts`, `src/data/drive/drive-http.ts` and their tests.
- **Find the cause first.** On staging, `GET /status` answered 404 (the route is not built yet) and the real bundle asked about 100 times in about 6 minutes with the home screen open. `SLOW_MS` is 60 s, so the beat alone does not explain it. Reproduce it in a test, name the path that asks (for example a reload on every emit, a foreground return, or several subscribers each scheduling), and say it in the delivery.
- **Research, cite:** [Google Cloud retry strategy](https://cloud.google.com/storage/docs/retry-strategy) (retry 408/429/5xx and network errors with exponential backoff, never other 4xx); Drive API "Resolve errors" page.
- **Acceptance contract:**
  - After a 4xx from `GET /status`, the run source stops its beat. It asks again only on the next foreground return or when the person asks (for example "Try again"). Named test: `the run status is not asked again after a 4xx`. With a Worker whose status answers 404 and the home screen's run subscribers live (at least two), advance fake timers 10 minutes: at most two `status()` calls.
  - Offline and 5xx failures keep today's beat. Named test: `a run status that fails offline or with a server error is asked again`.
  - Drive: named test `Drive never retries a client error other than 429`. A 400, 403 (not rate-limit), 404 and 409 are each fetched once. A 401 gets one fresh token and one more try. 429 and 5xx keep their three growing waits. If this already holds, the test pins it.
  - Out of scope: adding new retries to Worker calls; the `/status` route (`worker-status-revision`); the home screen's sentence for a missing status.
  - Files in scope: `src/data/live/runs.ts`, `src/data/live/index.ts`, `src/data/provider.tsx` if the cause is there, `src/data/drive/drive-http.ts`, and the matching tests (`src/data/live/live.test.ts`, `src/data/drive/drive-http.test.ts`, or a new test file next to the code).
- **Gates:** the verify (the three names, red first on an assertion), `pnpm check`, and `pnpm e2e:fake` for the home and run screens (`e2e/qa5.spec.ts`, `e2e/qa10.spec.ts`) on a private port 5195–5198. Never write `harness/` records, run `done.sh` or `wrangler`.
- **Deliver, under 15 lines:** the cause found, commit SHA, red→green, gates, sources cited, anything left out.
