p4-rate-limits adversarial review — pass 2, scoped

Verdict: **PASS**
Range: `7ec96d79..dfcdf95f`
Blocking findings: none.

All pass-1 defects are fixed and pinned by regression assertions in red repair `98174541`:

- `api/src/security.ts:164`: rotating XFF without CF address → request 21 gets 429; pinned at `api/test/rate-limits.test.ts:73`.
- `api/src/auth.ts:293`: unauthenticated logout → 401 without counting; pinned at test line 103.
- `api/src/security.ts:191`: missing/throwing binding → 500 without an opt-in flag; pinned at test line 191.
- `api/src/auth.ts:235`: valid callback with unavailable binding → 500 without Google calls or session issuance; pinned at test line 207.

The repair preserves 20/30/60 limits and Retry-After bounds; repaired tests remain untouched by the fix.
`api/test/in-process.ts:214` supplies test doubles only; production uses the same enforced binding path.
One rate-limit mechanism remains: `enforceRateLimit`.

Minor:

- `docs/harness/2026-10-10-p4-rate-limits-notes.md:83`: obsolete flag/deletion descriptions remain without a historical label.

Static review only; API tests were not run, and observed red/green execution is not certified.
