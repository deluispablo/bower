# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

P2 closed at `00ec9a5` ([dossier](2026-10-06-p2-dossier.md)). **P3 started** ([TL-P3-01](2026-10-06-tl-p3-01-p3-start.md), P3_DRAFT adopted). Integration branch `claude/p3` (from main 93d70e9), checkout `/Users/deluisp/Projects/bower-app`. Staging from 605bbaa (ec070ce8).

- **Batch P3-1:** both entries closed (c11 bff8e9d, console guard c1a0b3d; 284/284). Suites on 5af6dd8: check 3492 and e2e:pwa 4 green; e2e and e2e:fake red only because the new guard flags failure-path tests logging their expected `BowerError`, plus a `TypeError` from qa26's own `navigator.locks` stub (test bug, not the app).
- **Running:** `bower-mechanical`, packet [2026-10-06-p3-1-console-allow-packet.md](2026-10-06-p3-1-console-allow-packet.md), `/private/tmp/bower-p3-allow` branch `claude/p3-allow`: scoped `allowConsole` in six tests and the qa26 stub fix. Then the four suites again.
- Batch close: spot check, `done.sh` each, the four full suites once, move `main`, push backup, tell the lead. No independent review (TL-P3-01). Next, P3-2 (lead, main 52ea78a): `worker-skeleton` and `shared-domain-package` first; then P3-B (`r2-oidc-two-accounts`, `drive-real-behavior-suite`) once the Worker can do the OAuth sign-in. The two synthetic test accounts exist; their addresses never go in the repo or messages. A probe that needs the owner to sign in: message the lead.
- Evaluations: fresh origin and bundle name checked (TL-P3-01).
- P2 evidence checkouts (`/private/tmp/bower-p2-*`) can be removed.
- Resume (TL-P2-45): never clear; after a compaction re-read HANDOFF and this file; a worker gone with no delivery is redispatched fresh from its packet.
