# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

P2 closed at `00ec9a5` ([dossier](2026-10-06-p2-dossier.md)). **P3 started** ([TL-P3-01](2026-10-06-tl-p3-01-p3-start.md), P3_DRAFT adopted). Integration branch `claude/p3` (from main 93d70e9), checkout `/Users/deluisp/Projects/bower-app`. Staging from 605bbaa (ec070ce8).

- **Batch P3-1 closed** at `be87050`: c11 + console guard (+ scoped `allowConsole` in six failure-path tests, qa26 stub fix). Suites: check 3492, e2e 226, e2e:fake 250, e2e:pwa 4. 284/284.
- **Batch P3-2 closed** at `541c26c`: `shared-domain-package`, `worker-skeleton`, `done-sh-api-paths` (TL-P3-03; Haiku attempt rejected, Sonnet climb). Suites: check 3496 + api 4, e2e 226, e2e:fake 250, e2e:pwa 4; harness 287/287.
- **Next:** register `worker-crypto-session` (and then the OIDC path to P3-B) on the lead's go.
- **Carried into `worker-crypto-session` (TL-P3-03):** error codes kebab-case per the contract plus a test that every emitted code is in the contract; add `x-bower-place`/`x-bower-epoch` to CORS allowHeaders (there or in `worker-session-lease`). Worker entries close with a real red from now on.
  - Then: P3-B (`r2-oidc-two-accounts`, `drive-real-behavior-suite`) once the Worker can do the OAuth sign-in. Test-account addresses never go in the repo or messages; a probe needing the owner's sign-in → message the lead.
- Evaluations: fresh origin and bundle name checked (TL-P3-01).
- P2 evidence checkouts (`/private/tmp/bower-p2-*`) can be removed.
- Resume (TL-P2-45): never clear; after a compaction re-read HANDOFF and this file; a worker gone with no delivery is redispatched fresh from its packet.
