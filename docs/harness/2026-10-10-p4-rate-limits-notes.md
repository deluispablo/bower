# p4-rate-limits implementation notes

implementer: codex

status: blocked before implementation; the sandbox refuses the test runtime's loopback listener.

## Test-first evidence

Tests were written before any application change. The exact verify title exists in
`api/test/rate-limits.test.ts`: `a route over its rate limit is refused`.
Its intended red is the 21st `/auth/login` request returning 302 instead of 429.
The current unmounted helpers cannot consume the injected bindings. Other intended reds are
requests 31 and 61 on `/drive/token` and `/vault`, and missing production binding returning 302.
These are intended assertions, not observed failures.

Actual red attempt:
`pnpm -C api exec vitest run --maxWorkers=2 > tmp-logs/rate-limits-red.log 2>&1`.
Exit 1 before tests ran: Wrangler's default log path is unwritable, then the runtime fails with
`Error: listen EPERM: operation not permitted 127.0.0.1`.

Retried the same allowed test command with `WRANGLER_LOG_PATH=../tmp-logs/wrangler-tests.log`
and `WRANGLER_SEND_METRICS=false`. Log: `tmp-logs/rate-limits-red-retry.log`.
Exit 1 again on the loopback listener. No assertion was reached; no red-first evidence is claimed.
No implementation was made because the required assertion failure could not be established.
The coordinator needs a test runtime allowed to listen on loopback to resume the red-first sequence.

## Files and split

Test files: `api/test/rate-limits.test.ts` (new; uncommitted draft).
Code files: none.
Notes file: `docs/harness/2026-10-10-p4-rate-limits-notes.md` (keep separate from tests and code).
Existing tests changed: none.
No git write command was run; coordinator owns all commits.

The draft tests exercise createApp().request with injected deterministic binding doubles:
20/30/60 boundaries, separate addresses/subjects, same subject with a different cookie/address,
Retry-After whole seconds bounded by 60, earlier origin/session/lease/folder/OAuth refusals,
callback 429 propagation, missing/broken binding behavior, and unchanged /process daily quota.
They use no real waits and no network. All behavior still needs executable red and green evidence.

removed: none; implementation stopped before replacing the in-memory counters.
removed: no baseline lines; both baselines remain unchanged.

## Checks

PASS: `node scripts/check-unused-gate.mjs`; log `tmp-logs/rate-limits-unused.log`.
PASS: `pnpm -C api exec tsc --noEmit -p .`; log `tmp-logs/rate-limits-tsc.log`.
PASS: `pnpm -C api exec eslint test/rate-limits.test.ts`; log `tmp-logs/rate-limits-eslint.log`.
BLOCKED: API vitest, before collection/assertions; logs above.
No pnpm check or e2e was run, as instructed.
Wrangler is installed locally. Dry run skipped: no binding/config implementation was reached,
and the existing staging config references ../dist, which is absent. No login or deployment was attempted.

## Local research and configuration discrepancy

Network was prohibited. Read the installed Cloudflare RateLimit declaration
(api/node_modules/@cloudflare/workers-types/index.d.ts) and Wrangler's installed config schema.
The declaration exposes limit({ key }) returning { success }, without a retry timestamp.
The schema confirms simple.period accepts only 10 or 60 seconds, with a separate namespace_id per binding.
The packet supplies the per-location/eventually-consistent limitation; not independently fetched here.
A conservative Retry-After of 60 seconds would fit that contract, without a second counter.

Sources supplied by the packet:
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3

The packet names api/wrangler.toml, but it does not exist. The actual staging config is
api/wrangler.jsonc, named bower-staging, and api/vitest.config.ts explicitly loads it.
When resumed, use that existing staging configuration; creating a parallel TOML config would leave
the real test/deploy entry point unchanged. No configuration was edited in this blocked turn.
tests changed: api/test/rate-limits.test.ts: the /process control now sends a valid body (it got 415 before admission)

## Implementation

Mechanism: Cloudflare Rate Limiting binding (developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), one
home `enforceRateLimit`/`rateLimit` in `api/src/security.ts`. Retry-After is a constant 60 (binding reports no remaining
time; RFC 9110 section 10.2.3). Limits 20/30/60 per minute live in `api/wrangler.jsonc` (`ratelimits`, made-up namespace
ids 1001-1003); the packet's `wrangler.toml` does not exist. Mounted: `/auth/login`, `/auth/logout` (after same-origin),
`/auth/callback` (after the OAuth cookie reads, before Google; 429 rethrown, not a redirect) by address; `/drive/token`
(after session and folder check) and `/vault` (after same-origin, session, lease) by `sub`. Missing binding fails closed
only with `RATE_LIMIT_REQUIRED=true`; a throwing binding is a 500. `env.ts` passes the bindings through `assertEnv`.
`api/test/no-rate-limit-bindings.ts` (new setup file) removes the real staging bindings from the suites' env, which share
one address; the rate-limits test injects doubles.

removed: api/src/security.ts createSlidingWindow, SlidingWindow, genericWindow, strictWindow, genericRateLimit, COOKIE_ROUTES, RATE_LIMIT_PER_MINUTE, GENERIC_RATE_LIMIT_*, STRICT_RATE_LIMIT_MAX_KEYS
removed: harness/unused-baseline.json and unused-production-baseline.json: 3 lines each (COOKIE_ROUTES, genericRateLimit, rateLimit)
tests changed: none

Checks: api vitest 244 pass (/tmp/rl-vitest.log); tsc and eslint clean; check-unused-gate pass. Not run: pnpm check, e2e.
tests changed: api/vitest.config.ts: a setup file removes the real rate-limit bindings from other suites (api/test/no-rate-limit-bindings.ts)
