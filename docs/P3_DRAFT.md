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
| TL-P2-24, TL-P2-25 | The session contract in the real Worker. Endpoint: `POST /session {place, action}` → `{active, epoch}`. Headers: `x-bower-place` and `x-bower-epoch` on `/process`, `POST /vault` and `DELETE /me`, and both are listed in CORS `Access-Control-Allow-Headers`. A stale or missing epoch on those calls gets 409 `{error:{code:'stale-session', message:"Bower is open in another window."}}`. `leave` on `pagehide` is sent with `fetch(..., {keepalive: true})`, because `sendBeacon` cannot carry the headers. `DELETE /me` releases the person's lease. A holder whose lease expired but was never taken by anyone else takes it again silently. A `check` by the same place that just sent `leave`, with no grant in between, gets the same epoch back; any other grant raises it. The client ignores replies to checks that began before a `leave` (a generation counter per `leave`). The client sends that generation, and the Worker discards a `check` carrying an older generation than the place's last `leave`, so a stale check can never grant the lease. The real source wires the session (place, `POST /session`) only once this endpoint exists. Until then it stays unwired, while fake and demo are wired. |
| TL-P2-37 Q3 | Google Docs, Sheets and Slides have no `sha256Checksum`, so a native Workspace pile member needs its own verification rule (for example identity plus `modifiedTime`) in the P3 runner. |
| TL-P2-38 | R2–R4 real-provider probes move here, on staging. C13 Undo, C15 preparation and the quality corpus move to P4. |
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

## Owner decisions (2026-10-06)

1. **Tidy-ups run on GitHub Actions**, as in the original. Claude Code runs there with the owner's existing Claude subscription token, inside GitHub's free minutes, so there is no extra cost. Cloudflare Workflows is not adopted: Claude from there means paid API use. R3 still measures dispatch, startup, duplicates and lost callbacks on GitHub Actions. Speed comes from preparation, fewer reads and fewer model calls, not from changing the executor.
2. **The new app replaces the original and reuses everything already set up**: Cloudflare account and domain, the Google OAuth client, the GitHub instance repository, and secrets.
   - **During P3,** the new Worker and app are deployed as a separate staging environment in the same account. Production is untouched.
   - **The original production is replaced at the end of P4,** once the new app tidies up with Claude. Before switching, a check confirms the new app reads the owner's existing Bower folder correctly. A rollback path is kept.
3. **Test accounts.** Two owner-provided Google accounts. Their addresses stay out of the repository.
   - **The second account** runs the real-service gates on synthetic data in its own Bower folder.
   - **The owner's main account** is used only for R2's isolation checks. Those checks never open or write its Bower folder.
   - **Allowlist.** Both go on the staging Worker's allowlist at P3 start. That needs the owner to run `wrangler login` once on this machine, because no session ever enters credentials.
4. **Free tiers only.** Any paid plan goes back to the owner first.
