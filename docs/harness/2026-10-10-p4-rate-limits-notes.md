# p4-rate-limits implementation notes

implementer: codex

status: red repair complete; runtime evidence awaits the coordinator (sandbox loopback EPERM).

## Original test-first attempt (historical)

This section records the initial sandbox attempt, before the coordinator completed the implementation below.

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

## Red repair

Assignment: red-owning session, TL-P4-29; repairs the three Blocking findings and the callback Minor finding
in `2026-10-10-codex-p4-rate-limits-adversarial.md`. Only the two test files and these notes changed.
No application source, config, git write command, API runtime, network request, or deployment was used.

tests changed: api/test/rate-limits.test.ts: remove the unwired RATE_LIMIT_REQUIRED fixture and fail-open expectation; add the review reds and positive controls; the existing over-quota logout assertion now carries a valid session and checks no retirement.
tests changed: api/test/no-rate-limit-bindings.ts: replace global binding deletion with accepting test bindings; unrelated suites use the binding path without bypassing production missing-binding handling.

Named tests and intended red assertions (not executed in this sandbox):

- `missing CF-Connecting-IP shares one bucket despite rotating X-Forwarded-For`:
  requests 1–20 redirect, request 21 must be 429 and all forwarding headers share one bucket.
  A request without either header also uses that bucket. A trusted CF address allows 20 requests
  despite changing forwarding headers, then refuses its 21st; only two buckets exist.
  Expected current failure: rotating spoofed addresses produce a 302 on request 21.
- `logout without a current session (missing) is refused before counting`,
  `logout without a current session (invalid) is refused before counting`, and
  `logout without a current session (retired) is refused before counting`:
  each of 20 same-origin requests must return 401 signed-out and never call the auth binding.
  Login at the same address then returns 302 and spends only one request. A valid logout
  returns 204, increments the same bucket, and retires the signed-in person's generation.
  Expected current failure: the first refused logout instead returns 204 and spends quota.
- `production configuration fails closed with a missing auth binding` and
  `production configuration fails closed with a throwing auth binding`:
  the real Wrangler-loaded vars plus fixture secrets pass through createApp().request unchanged,
  without a fabricated production switch. A healthy binding first gives login 302; missing/throwing
  then gives 500 internal and no redirect. Expected current missing-binding failure: 302.
- `a valid OAuth callback fails closed with a missing binding` and
  `a valid OAuth callback fails closed with a throwing binding`:
  an OAuth cookie, matching state/nonce and locally signed Google ID token first complete sign-in
  with a healthy binding, redirect to the app and set a session cookie. The same valid callback
  with a missing/throwing binding must return 500 internal, make no Google call, issue no session,
  and leave the account generation unchanged. Expected current failure: a 302 sign-in redirect.

The existing exact verify title remains `a route over its rate limit is refused`.
All 20/30/60 boundaries and Retry-After assertions are preserved. No tests are skipped or weakened.
The local OAuth fixture follows `api/test/auth.test.ts` using the existing jose library.
The installed Cloudflare workers-types RateLimit interface and Wrangler schema were inspected offline;
the binding double still implements limit({ key }) returning { success }. Sources are the packet's
Cloudflare binding URL and RFC 9110 section 10.2.3 listed above; no online research was performed.

Static checks: TypeScript and ESLint pass; logs `/tmp/p4-rate-limits-red-repair-tsc.log` and
`/tmp/p4-rate-limits-red-repair-eslint.log`. `git diff --check` passes.
API tests and pnpm check were deliberately not run: the coordinator owns runtime red evidence and gates.
The expected failures above are from static inspection, not observed assertion failures.
Coordinator commands: `pnpm -C api exec vitest run test/rate-limits.test.ts`, then the packet verify
`pnpm -C api exec vitest run -t "a route over its rate limit is refused"`; redirect output to log files.
Full API suites must also run after the application fix to check the shared accepting bindings.
All changes remain uncommitted for the coordinator, as requested.

## Fix round 1

Codex adversarial review (BLOCK) fixed in `api/src`, against the repaired red (98174541), untouched.
- `clientIp` (`security.ts`): `X-Forwarded-For` is never a key; no `CF-Connecting-IP` shares the `unknown` bucket.
- `POST /auth/logout` (`auth.ts`): same-origin, then `requireSession`, then the count; the hand-made
  `authenticate` try/catch is gone. A request without a valid session is a 401 and counts nothing.
- Missing binding fails closed (500) in every environment; `RATE_LIMIT_REQUIRED` removed from `env.ts`
  and the `wrangler.jsonc` comment. Tests and the in-process harness inject their bindings.
- `RateLimitUnavailable` (`security.ts`) marks a missing or throwing binding; the OAuth callback rethrows it
  (like `rate-limited`) instead of redirecting to sign-in, so no session is issued.
- One mechanism kept (`enforceRateLimit`); `node scripts/check-unused-gate.mjs` passes (26 known, none new).
removed: `RATE_LIMIT_REQUIRED` (env.ts field and parse, wrangler comment); `x-forwarded-for` branch of `clientIp`;
removed: the logout handler's own `authenticate` / signed-out catch (`auth.ts`).
tests changed: api/test/in-process.ts: harness Env gains accepting rate-limit bindings (the Worker now fails closed without them).
tests changed: none else; rate-limits.test.ts and no-rate-limit-bindings.ts untouched.
Logs: /tmp/rl-fr1-vitest.log (26 files, 251 pass), /tmp/rl-fr1-tsc*.log, /tmp/rl-fr1-eslint*.log, /tmp/rl-fr1-check2.log.
