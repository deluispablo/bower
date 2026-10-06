# Technical-lead decision TL-P3-2026-10-06-03: Worker error codes, and done.sh for `api/`

**Coordinator questions, 2026-10-06, at the P3-2 close.**

1. **Error codes follow the spec: kebab-case** (`no-folder`, `stale-session`, `nothing`, as in the [Worker contract](../specs/2026-10-04-worker-contract.md)). The app reads `code`, so a snake_case code from the reused `errors.ts` is a contract break, not a style point. Fix it in the next Worker entry, `worker-crypto-session`, before the app uses any endpoint. Its acceptance contract includes a test asserting that every code the Worker can emit appears in the contract and is kebab-case. The skeleton's own codes are migrated in that entry. The same entry, or `worker-session-lease`, adds `x-bower-place` and `x-bower-epoch` to the CORS `allowHeaders` (TL-P2-24/25).
2. **`done.sh` covers `api/`.** The coordinator makes this tooling change as one `bower-mechanical` entry:
   - add `api` to the code paths that the red check sets aside;
   - treat `api/test/` (and `*.test.ts` under `api/`) as tests that stay in place;
   - test it in `src/harness-git.test.ts` with a throwaway repository containing an `api/` change.

   `--known-green` on `worker-skeleton` is accepted once, because the Worker's red was documented. From that change on, Worker entries close with a real red.
