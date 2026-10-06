# Packet: worker-error-codes-contract (P3-3 fix round)

Starting model: `bower-implementer` (Sonnet), fresh. Reason: contract alignment with clear tests ([TL-P3-05](DECISIONS.md)).

- **Entry:** `worker-error-codes-contract` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-codes`, branch `claude/p3-codes`, from the integration head (both P3-3 entries merged). Never push or deploy.
- **Read:** `docs/harness/WORKER.md`, this packet, `docs/specs/2026-10-04-worker-contract.md` (the general-codes table near line 40), `api/src/{errors,env,security,index,person,person-schema,session}.ts`, `api/test/{errors,person,skeleton}.test.ts`.
- **Acceptance contract:**
  - Every `HttpError` and every error response uses a code and the message from the contract table (`signed-out` 401, `forbidden` 403, `not-found` 404, `payload-too-large` 413, `unsupported-media-type` 415, `rate-limited` 429, `internal` 500, plus the route codes already in the contract). `config` is gone: missing config or a missing secret answers 500 `internal` with the table's message, and the cause goes to `console.error` only (OWASP: no cause in a 500).
  - The error-code test reads the allowed codes (and statuses) from the contract table by parsing the Markdown; `PENDING_CONTRACT_CODES` is removed. Named tests: `a missing secret answers internal and names no cause`, `every error code the Worker emits is in the contract and kebab-case` (kept, now against the parsed table).
  - Review minors: named test `a person object refuses storage from a newer build` (set the stored version above the build's, restart the object, the next call fails and nothing is downgraded); `assertEnv` checks the `PERSON` binding like the others; a `SESSION_SECRET` shorter than 32 bytes is refused at startup (RFC 2104), with a test; remove the stale `docs/runbook.md` reference in a doc comment.
  - Red first on assertions for each named test (current code emits `config`, has no refusal test, accepts short secrets).
  - Files in scope: `api/src/**`, `api/test/**`. Do not edit the contract (the lead owns it); if the table and code disagree in a way you cannot resolve, stop and report.
- **Gates:** the verify, `pnpm check`. Never write `harness/` records or run `done.sh`.
- **Deliver, under 15 lines:** commit SHAs, files, red→green per named test, gates, left out.
