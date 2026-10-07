# Technical-lead decision TL-P3-2026-10-07-26: `nothingReady`, the security review, and the freeze

**Coordinator questions, 2026-10-07**, after P3-E closed (`a22f288`).

1. **`nothingReady: true` is approved** as an optional `RunReport` field, and the contract's `last-run.json` line now names it. Every reader must accept it. If the fake runner can produce it through the shared spine, the P2 fake runner's closed `parseRunReport` accepts it in the same batch, as one `bower-mechanical` fix with a test.
2. **`security-review`** (`bower-escalated`, read-only; each Critical or Important finding becomes its own fix entry). It covers the Worker, the runner, `tidy.yml` and `scripts/`, judged against [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/) (sessions, authentication, access control, secrets and logging) and [GitHub Actions security hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions):
   - **Sessions and requests:** session cookie flags, rotation and generation; origin and CORS checks on every changing route; the allowlist.
   - **Tickets:** generation, hash-only storage, expiry, attempt fencing and masking in the runner. No token, ticket or note text is ever logged, which is checked against the Workers Logs fields.
   - **What delete leaves:** after delete, only the generation floor.
   - **Actions and scripts:** `tidy.yml` permissions and actions pinned by commit SHA; injection through `client_payload` in `run-name` and steps; the production guards in the deploy scripts.
   - **Dependencies:** `pnpm audit` of the Worker and runner dependencies.
   - **The runbook's two unchecked claims:** rotating `TOKEN_ENC_KEY` forces re-consent, and a redispatch with `GITHUB_TOKEN` missing.
   - **Recorded as P4 items, not findings:** the rate limits (TL-P3-14), and the verification of the restricted `drive` scope (TL-P3-11).
3. **The freeze does not wait for 2026-10-12.** The owner chose option A ([TL-P3-16](2026-10-07-tl-p3-16-codex-review-after-p3.md)), so P3-G runs in this order:
   1. `security-review` and its fixes.
   2. Freeze the SHA and run the four suites.
   3. The cross-provider review on the TL-P2-46 Opus fallback, over the Worker, the spine and the real adapters.
   4. Deploy the frozen SHA and walk C16 on staging, on phone and desktop, by keyboard, on a fresh origin. It includes the owner's live revocation step.
   5. The dossier.

   The Codex review of the P3 range on 2026-10-12 comes before P4, not before the P3 close.
