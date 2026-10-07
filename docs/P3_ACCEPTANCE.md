# Phase 3 acceptance

**Status: adopted by the technical lead under [TL-P3-01](harness/2026-10-06-tl-p3-01-p3-start.md), 2026-10-06.** The plan is [P3_DRAFT](P3_DRAFT.md) under [WORK_PLAN](WORK_PLAN.md) Phase 3. This document says what "P3 done" means. P2's [acceptance](P2_ACCEPTANCE.md) stays the baseline. Every P2 journey keeps passing on demo and fake, and none of its screens or domain logic is rewritten ("Prove the accepted app needs no screen/domain rewrite").

All real-service evidence uses synthetic data, on the staging Worker. The owner gave two test accounts on 2026-10-06; neither holds the owner's real Bower folder, so both carry synthetic Bower folders and both serve the R2 isolation checks. Their addresses stay out of the repository. The account with the owner's real folder is never used in P3.

## Capability matrix, P3 column

"Not in P3" rows keep their P2 evidence. Nothing here asks for model quality, which belongs to P4.

| ID | What must work against real services by P3 exit |
| --- | --- |
| C01 | Real Google sign-in (PKCE), with the ID token validated: signature, issuer, audience, expiry. People are keyed by `sub`. The folder is created, found and recovered in real Drive. Sign-out, revocation and "delete my account" behave truthfully, and two accounts never see each other's data (R2). |
| C02 | Pre-generated file IDs plus the resumable upload protocol on real Drive. An upload interrupted by a reload resumes or reports honestly (R4). The upload queue is on for the real source only with R4 evidence. |
| C03 | Browse, search, move, rename, edit and Bin/restore against real Drive. Covers pagination, changed versions, name and parent conflicts, and lost replies (the `drive-real-behavior-suite`). The modifiedTime race stays a documented limitation (owner ruling R1). |
| C04–C11 | The same scripted journeys run end to end through the real Worker and the real execution spine, using the scripted semantic provider, with effects in real Drive. |
| C12 | Real admission, with one active run per person and idempotent `requestId`. Real dispatch to GitHub Actions, ordered status with a revision, authenticated runner callbacks, and stale-run recovery without the browser. Duplicate dispatch, lost callbacks, expired attempts and a closed browser are all covered (R3). |
| C13 | Not in P3 (moved to P4 by TL-P2-38). |
| C14 | A real session lease in the per-person Durable Object, following the TL-P2-24/25 contract exactly: `POST /session`, epoch headers on `/process`, `POST /vault` and `DELETE /me`, 409 `stale-session`, and `leave` via `fetch` keepalive. External Drive changes while the app is open are handled. |
| C15 | Not in P3, except the real transport of the ready-input package (TL-P2-38). |
| C16 | The C01–C12 and C14 journeys against staging, on phone and desktop, by keyboard, with no unexplained console errors, on a fresh origin with the bundle checked. |

## Owner setup (`p3-accounts-and-secrets`)

No session ever enters credentials. Each step below is the owner's, done once:

1. **Two Google test accounts.** Given on 2026-10-06. Their addresses go only into the staging Worker's allowlist (a Worker secret or the store it reads), never into the repository. The owner signs in to each when a probe asks for it.
2. **Cloudflare.** `wrangler login` on this machine is already done, and staging deploys work. Paid plans go back to the owner first.
3. **Google OAuth client.** Reuse the existing client. Add the staging Worker's origin and redirect URI in the Google Cloud console.
4. **Worker secrets.** Set them with `wrangler secret put` against the staging Worker: session key, encryption key, OAuth client secret and runner-ticket key. The runbook entry `runbook-p3` lists their names.
5. **GitHub Actions.** The runner uses the existing instance repository and the owner's Claude subscription token as a repository secret. Only the scripted provider runs in P3.

## P3 exit checklist

- Every registered P3 entry passes with a valid proof. No Critical or Important finding is open; Minor findings go to a P3 polish list.
- R2, R3 and R4 results are recorded with exact limitations. No data-safety guarantee rests on an unproven premise.
- The shared behaviour suites pass against the real adapters. Covered cases: browser close, revoked auth, duplicate dispatch, expired attempts, lost callbacks and recovery.
- `pnpm check`, `pnpm e2e`, `pnpm e2e:fake` and `pnpm e2e:pwa` pass on the frozen SHA. The staging journeys (C16) pass on the deployed build of that SHA.
- One cross-provider review covers the Worker, the spine and the real adapters, and one evaluation covers staging. While Codex is unavailable, the review is the TL-P2-46 Opus fallback, and a Codex review follows before P4 ([TL-P3-16](harness/2026-10-07-tl-p3-16-codex-review-after-p3.md)).
- `runbook-p3` covers setup, secrets, rotation, deletion and recovery. A security review of the Worker and the runner is done.
- Free tiers only. Production and the original app are untouched until P4.
