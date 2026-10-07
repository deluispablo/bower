# Packet: security-review (P3-19, at the freeze)

Starting model: `bower-escalated` (Opus). The review is **read-only for product code**. You write only the review record and its docs test. Every finding becomes a fix entry that the coordinator registers. Scope: [TL-P3-26](2026-10-07-tl-p3-26-security-review-and-freeze.md) point 2, the P3_ACCEPTANCE closing line ("A security review of the Worker and the runner is done").

- **Entry:** `security-review`. Checkout `/private/tmp/bower-p3-security`, branch `claude/p3-security`, from the commit named in your prompt. Never push or deploy. Never run `wrangler` or `gh` writes. Read-only `pnpm audit` is allowed. Make no call to a live service.
- **Standards (cite the exact requirement ids):**
  - [OWASP ASVS 5.0](https://github.com/OWASP/ASVS/tree/v5.0.0): the chapters on session management, authentication (OAuth), access control, API and web service, secure communication, logging and error handling, data protection, and configuration.
  - [GitHub Actions security hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions): pinning by full commit SHA, untrusted input in `run:`, `permissions`, secrets in logs.
- **Read:**
  - `docs/harness/WORKER.md` and this packet.
  - `api/src/**`, `api/wrangler.jsonc`, `runner/src/**`, `runner/workflows/tidy.yml`.
  - `scripts/deploy-staging.sh` and `scripts/new-instance.sh`.
  - `docs/specs/2026-10-04-worker-contract.md`, `docs/runbook.md`, `docs/harness/STAGING.md`.
  - The app's Worker client (`src/data/worker/worker-http.ts`) and its cookie and origin handling.
- **Check, at least:**
  1. **Cookies and origin.** Check the session cookie's attributes (`HttpOnly`, `Secure`, `SameSite`, `Path`, lifetime) and the same-origin check on writes. Check CORS on every route and the `x-bower-place`/`x-bower-epoch` handling. Check session generation and `SESSION_SECRET_PREVIOUS` rotation.
  2. **Runner tickets.** Check that tickets are stored only as a SHA-256 hash and compared in constant time. Check expiry, retirement and attempt fencing (`stale-attempt`). Check that the ticket is never logged, never returned after mint, and masked in Actions. Check `idFromString` on hostile ids.
  3. **Logs.** No secret, token, refresh token, ticket or note text reaches `console.*`, an error cause or a reply. Check the admission path that now reads pile notes.
  4. **Delete.** After "Delete my account", only the generation floor remains in the person object, plus nothing else the contract does not list. Check KV and the allowlist too.
  5. **tidy.yml.** Actions must be pinned by full commit SHA (record which ones are not). Check `client_payload` injection into `run:` or `run-name`, the least `permissions`, and `persist-credentials`.
  6. **Deploy guards.** `deploy-staging.sh` must never be able to reach production. `new-instance.sh` must handle no secret.
  7. **Dependencies.** Run `pnpm audit --prod` for the app, `api/` and `runner/`. Record each advisory with a verdict.
  8. **Runbook claims.**
     - Does a `TOKEN_ENC_KEY` rotation force each person to sign in again with consent?
     - Does a stale-run redispatch fail again, and say what, when `GITHUB_TOKEN` is missing or wrong?
     Prove each against code or a unit test, and correct the runbook if it is wrong (the runbook is in scope for that fix only).
  9. **P4 notes, not findings:** rate limits (TL-P3-14) and Google's drive-scope verification.
- **Record:**
  - `docs/harness/2026-10-07-p3-security-review.md`: one line per ASVS requirement checked (id, pass or finding, evidence `file:line`), the Actions items, the audit results, the two runbook claims, the P4 notes, and a verdict line `verdict: PASS` or `verdict: FINDINGS (n)`.
  - Each finding gets a severity (Critical, Important or Minor) and a suggested fix-entry id.
- **Named test** (add it to `src/docs.test.ts`): `the P3 security review is recorded`. The file exists, has a verdict line, and every finding names a fix-entry id or `P4 note`. Commit the test on its own first, so it fails while the file is missing.
- **Files in scope:** the review file, `src/docs.test.ts`, and `docs/runbook.md` (claim corrections only).
- **Gates:**
  - the verify;
  - `pnpm check` in full.
  - Never write `harness/` records or run `done.sh`.
- **Reply:** the review card in `docs/harness/WORKER.md`, listing every finding with its severity and suggested entry id.
