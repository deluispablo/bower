# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

P2 closed at `00ec9a5` ([dossier](2026-10-06-p2-dossier.md)). **P3 started** ([TL-P3-01](2026-10-06-tl-p3-01-p3-start.md), P3_DRAFT adopted). Integration branch `claude/p3` (from main 93d70e9), checkout `/Users/deluisp/Projects/bower-app`. Staging from 605bbaa (ec070ce8).

- **Batch P3-1 closed** at `be87050`: c11 + console guard (+ scoped `allowConsole` in six failure-path tests, qa26 stub fix). Suites: check 3492, e2e 226, e2e:fake 250, e2e:pwa 4. 284/284.
- **Batch P3-2 closed** at `541c26c`: `shared-domain-package`, `worker-skeleton`, `done-sh-api-paths` (TL-P3-03; Haiku attempt rejected, Sonnet climb). Suites: check 3496 + api 4, e2e 226, e2e:fake 250, e2e:pwa 4; harness 287/287.
- **Batch P3-3 closed** at `5049ffa`: crypto-session, person-object, focus-timers, error-codes fix round. Suites: check 3499 + api 55, e2e 226, e2e:fake 250, e2e:pwa 4; 291/291.
- **Batch P3-4, running:** `worker-google-oidc`, `bower-escalated`, packet [2026-10-06-p3-4-oidc-packet.md](2026-10-06-p3-4-oidc-packet.md), `/private/tmp/bower-p3-oidc` branch `claude/p3-oidc`. Then one review, close, and the first staging deploy of the Worker (needs the owner: Google console redirect URI and secrets; asked the lead who does what).
- **Owed acceptance items (TL-P3-04 amendment, main 11d68fd):** `worker-google-oidc` stores and checks the session generation (`assertCurrentGeneration`) and wires `SESSION_SECRET_PREVIOUS` rotation; `worker-session-lease` adds lease expiry and leave-generation columns (schema v2 with a tested v1→v2 migration); the first route that reaches the person object answers `internal` with no cause on its errors. New modules go stub-first (METHOD step 6) so `done.sh` shows the red.

- Evaluations: fresh origin and bundle name checked (TL-P3-01).
- P2 evidence checkouts (`/private/tmp/bower-p2-*`) can be removed.
- Resume (TL-P2-45): never clear; after a compaction re-read HANDOFF and this file; a worker gone with no delivery is redispatched fresh from its packet.
