# Packet: review of worker-skeleton (P3-2)

Starting model: `bower-escalated` (Opus), fresh, read-only. Reason: cross-provider review is unavailable until 2026-10-12; [TL-P2-46](2026-10-06-tl-p2-46-review-fallback.md) fallback, with its counters: read only this packet, the implementation packet and the diff, never the worker's delivery; assume the code is wrong until a test or a reading proves otherwise; each Critical/Important finding names the failing scenario and the missing or weak test.

- **Range:** `git -C /private/tmp/bower-p3-worker diff e84c2a2 0f94292` (checkout `/private/tmp/bower-p3-worker`, do not edit or commit).
- **Contract:** [2026-10-06-p3-2-worker-skeleton-packet.md](2026-10-06-p3-2-worker-skeleton-packet.md) and the error-format section of `docs/specs/2026-10-04-worker-contract.md`.
- **Focus:** CORS (only the app origin; credentials; preflight; what other origins receive), security headers, error handler (no stack or internals leak, status codes), env check, secrets or real ids in `wrangler.jsonc`, workspace wiring (root `pnpm check` really runs the api lint, typecheck and tests and fails when they fail), dependency choices (versions, the vitest pin in `api/`).
- **Research first:** cite the Fetch CORS spec or MDN for credentialed CORS, and Hono's cors middleware behaviour, when a finding rests on them.
- **You may** run `pnpm -C api exec vitest run` and `pnpm check` in that checkout, output to `/tmp/p3-wsk-review-*.log`; a throwaway test only under `/tmp`.
- **Deliver, under 30 lines:** verdict (CLEAN / BLOCKING), blocking findings (file:line, scenario, missing test), minors one line each.
