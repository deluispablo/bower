# Packet: worker-crypto-session (P3-3)

Starting model: `bower-implementer` (Sonnet). Reason: reuse of the original crypto and session ([TL-P3-04](2026-10-06-tl-p3-04-batch-p3-3.md)); the risk is covered by the batch review.

- **Entry:** `worker-crypto-session` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-crypto`, branch `claude/p3-crypto`. Never push, never deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `docs/specs/2026-10-04-worker-contract.md` (error codes and session sections), and from `/Users/deluisp/Projects/bower/api/`: `src/crypto.ts`, `src/session.ts`, `test/crypto.test.ts`, `test/session.test.ts`, `test/secret-rotation.test.ts`, `test/errors.test.ts`.
- **Research first:** cite Web Crypto AES-GCM (unique 96-bit IV per message) and HMAC cookie signing guidance (e.g. OWASP session management), and how the original handles rotation.
- **Acceptance contract:**
  - `api/src/crypto.ts` copied as it is; `api/src/session.ts` adapted (people keyed by OIDC `sub`, TL-P2-05; no KV-only state the Durable Object will own later; say what you adapted and why).
  - Ported tests, renamed where needed; the three named tests exist: `the envelope round-trips and refuses a tampered byte`, `a session cookie signed with the old secret is accepted after rotation`, `every error code the Worker emits is in the contract and kebab-case`. Also the constant-time compare and the generation counter (older cookies refused after a bump).
  - Error codes: every code `api/src/` can emit (collect them from the source or a single codes module) is kebab-case and listed in the contract; fix `not_found` → `not-found`, `internal` → the contract's code, and the `env.ts` config error. If the contract lacks a code you need, stop and report it.
  - CORS `allowHeaders` adds `x-bower-place` and `x-bower-epoch`; a test sends that preflight from the app origin and sees them allowed.
  - Red first on assertions (the error-code test fails on today's snake_case).
  - Files in scope: `api/src/{crypto,session,errors,security,env,index}.ts`, `api/test/**`. Keep `index.ts` and `env.ts` edits small: the other P3-3 worker adds a Durable Object export and binding there.
- **Gates:** the verify, `pnpm check`. Close will run `done.sh` with a real red, so keep the fix in code files under `api/src/` and the tests under `api/test/`.
- **Deliver, under 15 lines:** commit SHAs, files, what was adapted, red→green, gates, sources, left out.
