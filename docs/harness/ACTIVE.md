# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

P2 closed at `00ec9a5` ([dossier](2026-10-06-p2-dossier.md)). **P3 started** ([TL-P3-01](2026-10-06-tl-p3-01-p3-start.md), P3_DRAFT adopted). Integration branch `claude/p3` (from main 93d70e9), checkout `/Users/deluisp/Projects/bower-app`. Staging from 605bbaa (ec070ce8).

- **Batch P3-1 closed** at `be87050`: c11 + console guard (+ scoped `allowConsole` in six failure-path tests, qa26 stub fix). Suites: check 3492, e2e 226, e2e:fake 250, e2e:pwa 4. 284/284.
- **Batch P3-2, running (TL-P3-02, two `bower-implementer`):**
  - `worker-skeleton`: `api/` workspace, Hono, `wrangler.jsonc`, /health, error format, CORS; packet [2026-10-06-p3-2-worker-skeleton-packet.md](2026-10-06-p3-2-worker-skeleton-packet.md), `/private/tmp/bower-p3-worker` branch `claude/p3-worker`. An Opus review follows (TL-P2-46 fallback; security and CORS).
  - `shared-domain-package` **closed** (ae15bd3).
  - `worker-skeleton` delivered 0f94292; **Opus review running**, packet [2026-10-06-p3-2-worker-skeleton-review-packet.md](2026-10-06-p3-2-worker-skeleton-review-packet.md). Old line: packet [2026-10-06-p3-2-shared-domain-packet.md](2026-10-06-p3-2-shared-domain-packet.md), `/private/tmp/bower-p3-domain` branch `claude/p3-domain`.
  - Then: P3-B (`r2-oidc-two-accounts`, `drive-real-behavior-suite`) once the Worker can do the OAuth sign-in. Test-account addresses never go in the repo or messages; a probe needing the owner's sign-in → message the lead.
- Evaluations: fresh origin and bundle name checked (TL-P3-01).
- P2 evidence checkouts (`/private/tmp/bower-p2-*`) can be removed.
- Resume (TL-P2-45): never clear; after a compaction re-read HANDOFF and this file; a worker gone with no delivery is redispatched fresh from its packet.
