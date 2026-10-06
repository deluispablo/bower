# Phase 3 draft plan: a minimal real backend

**Status: draft by the technical lead, 2026-10-06. Not adopted, and no entry is registered.** The coordinator registers P3 entries only after P2 closes, following GOVERNANCE. Revision stays `2026-10-05-contracts-2`. This draft gathers the P3 obligations that came out of P2 decisions, together with the reuse found in the original app, so that P3 can start the day P2 closes. The authority stays with [WORK_PLAN](WORK_PLAN.md) Phase 3, [ARCHITECTURE](ARCHITECTURE.md) and the [Worker contract](specs/2026-10-04-worker-contract.md).

## Goal and entry condition

**Goal.** Replace P2's fake Worker and fake Drive with real services, and keep the accepted app unchanged:

- a small Cloudflare Worker;
- real Google sign-in and Drive;
- a deterministic execution spine that runs a tidy-up without the browser, with a scripted semantic provider instead of Claude.

**Entry.** P2 closed, with its dossier, and the owner's conditional acceptance recorded. P4 stays unauthorized.

## Obligations carried from P2 decisions

| From | Obligation |
| --- | --- |
| TL-P2-05 | Real identity is a validated OpenID Connect `sub`: signature, issuer, audience and expiry checked. The person's email is never the key. |
| TL-P2-05, TL-P2-07 | Uploads use pre-generated file IDs plus a resumable session. The upload queue is turned on for the real source only with R4 evidence. |
| TL-P2-06, TL-P2-10 | Recovery is owned by the service, without changing RunWire. Public `done` and `failed` are derived only after the terminal view is confirmed. The legacy path is gone. |
| TL-P2-09, TL-P2-12 | Readiness looks members up using Drive checksum metadata, plus one bounded query of trashed files by `appProperties`. |
| TL-P2-13, TL-P2-14 | A per-person session lease, `POST /session`. The Worker enforces the epoch on `process`, `createFolder` and `deleteAccount`. The app caches the lease for 5 seconds. |
| readiness entry | Pile declarations are turned on for the real source once the P3 runner consumes them. |
| owner ruling R1 | The modifiedTime check stays, and the rare race is a documented limitation. No work. |
| contract | One OAuth client with the full `drive` scope for app and runner. The Worker runs on the app's own site. The app's existing calls keep their shapes. |

## Reuse (owner rule: reuse before building)

The source is the original repository, `/Users/deluisp/Projects/bower` (FSL-1.1-MIT, the owner's). It was inventoried on 2026-10-06.

| Take | Verdict |
| --- | --- |
| `api/src/crypto.ts`: AES-256-GCM envelope and constant-time compare | Reuse as is |
| Security middleware, error format, `assertEnv` (`security.ts`, `errors.ts`, `env.ts`) | Reuse as is |
| `session.ts`: signed session cookie, generation counter, secret rotation | Adapt |
| `google.ts`: PKCE flow and token helpers | Adapt. Add ID-token validation with [`jose`](https://github.com/panva/jose) (`createRemoteJWKSet` + `jwtVerify`), and key people by `sub`. |
| Run tickets: random, hashed, retired at the end | Reuse the idea, bound to run id and epoch |
| Status report validation, stale-run thresholds, job-conclusion fallback | Adapt. Add a revision so out-of-order reports are refused. |
| `repository_dispatch` behind an injected fetch | Reuse, if R3 keeps GitHub Actions |
| Test harness: `@cloudflare/vitest-pool-workers` plus an injected `fetchImpl` stub | Reuse as is |
| `deploy-api.sh`, runbook sections on OAuth, Cloudflare and secrets | Adapt (Durable Object migrations) |
| Resumable protocol functions and token cache (`app/src/upload-queue.ts`, `app/src/drive.ts`) | Already adapted in P2. Add `files.generateIds`. |

Avoid the old KV-only run admission and quota: both have races documented in their own comments. Instead, use one [Durable Object](https://developers.cloudflare.com/durable-objects/platform/limits) per person, SQLite-backed and available on the free plan without storage charges. It holds the session lease, run admission (one active run, `requestId` idempotency), an atomic quota, the B control row (head, status revision, claim, epoch) and run tickets. Keep KV only for the operator allowlist, or move that into the Durable Object too. The KV free tier allows 1,000 writes a day.

## Work packages and draft entries (about 38)

| Package | Draft entries |
| --- | --- |
| P3-A Adoption | `p3-acceptance-checklist` (C01–C16 P3 column); `p3-accounts-and-secrets` (owner setup, see the decisions below) |
| P3-B Real premises, synthetic data only | `r2-oidc-two-accounts`; `r3-executor-probe` (startup, duplicate and lost dispatch, lost callback); `r4-resumable-reserved-id-real`; `drive-real-behavior-suite` (pagination, versions, name and parent conflicts, lost replies) |
| P3-C Worker control plane | `worker-skeleton`; `worker-crypto-session`; `worker-google-oidc`; `worker-me-and-delete`; `worker-drive-token`; `worker-vault-pointer` (`{folderId, found}`); `worker-person-object`; `worker-session-lease`; `worker-process-admission`; `worker-status-revision`; `worker-dispatch`; `worker-runner-tickets`; `worker-stale-run-recovery`; `worker-rate-limits` |
| P3-D Execution spine | `shared-domain-package` (the `src/data/contracts` guards usable by the runner); `runner-drive-adapter` (fenced mutation boundary, evidence reads); `spine-admission-manifest`; `spine-operations-checkpoints`; `spine-report-barrier-dispositions`; `scripted-semantic-provider`; `spine-recovery-without-browser`; `spine-ordered-status` |
| P3-E App on real adapters | `worker-http-real`; `upload-queue-real`; `declare-piles-real`; `session-lease-real`; `behavior-suites-real-adapters`; `compatibility-accepted-app` |
| P3-F Operations | `deploy-and-migrations`; `runbook-p3` (setup, secrets, rotation, deletion, recovery); `security-review` |
| P3-G Close | `p3-dossier-review-evaluation` (same journeys end to end against real services with synthetic accounts) |

The order follows WORK_PLAN:

1. P3-A, then P3-B.
2. P3-C and P3-D in parallel once their contracts are fixed.
3. P3-E.
4. P3-F and P3-G.

Review findings will add entries, as in P2. The rulings already taken (reuse, single session, simplest answers for rare cases) should keep that count far below P2's.

## Decisions the owner must take before or at P3 start

1. **Where tidy-ups run.**
   - **GitHub Actions**, as in the original. It is known and reused, but it has minutes of startup, which is part of why the old tidy-ups were slow.
   - **[Cloudflare Workflows](https://developers.cloudflare.com/workflows/) or Durable Object alarms** running the deterministic spine. This is fast, and Workflows has a free plan, but its per-invocation CPU limits must be measured.

   R3 measures both on synthetic data. This choice also shapes how P4 calls Claude: from GitHub Actions or from the API, each with a different cost. That makes it the owner's decision, and the lead will recommend from R3's numbers.
2. **Deployment.** A new, separate Cloudflare deployment on its own subdomain. The original app's production is never touched (GOVERNANCE), and moving people across is a later decision.
3. **Test accounts.** One synthetic Google account for the real-service gates, and a second one for R2's isolation proof. Credentials stay outside the repository.
4. **Cost.** Free tiers only. If measurements show a paid plan is needed (for example Workers Paid, $5 a month), the owner decides.
