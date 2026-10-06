# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

P2 closed at `00ec9a5` ([dossier](2026-10-06-p2-dossier.md)). **P3 started** ([TL-P3-01](2026-10-06-tl-p3-01-p3-start.md), P3_DRAFT adopted). Integration branch `claude/p3` (from main 93d70e9), checkout `/Users/deluisp/Projects/bower-app`. Staging from 605bbaa (ec070ce8).

- **Batch P3-1, running (two `bower-implementer`):**
  - `c11-no-policy-from-documents`: packet [2026-10-06-p3-1-c11-packet.md](2026-10-06-p3-1-c11-packet.md), `/private/tmp/bower-p3-c11` branch `claude/p3-c11`, no Playwright.
  - `no-console-errors-on-journeys`: packet [2026-10-06-p3-1-console-packet.md](2026-10-06-p3-1-console-packet.md), `/private/tmp/bower-p3-console` branch `claude/p3-console`, Playwright port 5196.
- Batch close: spot check, `done.sh` each, the four full suites once, move `main`, push backup, tell the lead. No independent review (TL-P3-01). Next: P3-2 (P3-B if test accounts, else `worker-skeleton` and `shared-domain-package`).
- Evaluations: fresh origin and bundle name checked (TL-P3-01).
- P2 evidence checkouts (`/private/tmp/bower-p2-*`) can be removed.
- Resume (TL-P2-45): never clear; after a compaction re-read HANDOFF and this file; a worker gone with no delivery is redispatched fresh from its packet.
