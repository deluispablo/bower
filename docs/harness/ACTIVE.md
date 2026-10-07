# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

P2 closed at `00ec9a5` ([dossier](2026-10-06-p2-dossier.md)). **P3 started** ([TL-P3-01](2026-10-06-tl-p3-01-p3-start.md), P3_DRAFT adopted). Integration branch `claude/p3` (from main 93d70e9), checkout `/Users/deluisp/Projects/bower-app`. Staging from 605bbaa (ec070ce8).

- **Batch P3-1 closed** at `be87050`: c11 + console guard (+ scoped `allowConsole` in six failure-path tests, qa26 stub fix). Suites: check 3492, e2e 226, e2e:fake 250, e2e:pwa 4. 284/284.
- **Batch P3-2 closed** at `541c26c`: `shared-domain-package`, `worker-skeleton`, `done-sh-api-paths` (TL-P3-03; Haiku attempt rejected, Sonnet climb). Suites: check 3496 + api 4, e2e 226, e2e:fake 250, e2e:pwa 4; harness 287/287.
- **Batch P3-3 closed** at `5049ffa`: crypto-session, person-object, focus-timers, error-codes fix round. Suites: check 3499 + api 55, e2e 226, e2e:fake 250, e2e:pwa 4; 291/291.
- **Batch P3-4 closed** at `fada339`: `worker-google-oidc` (Opus build, Opus review CLEAN, Sonnet fix round with TL-P3-07; real red, aaea665). Suites: check 3503 + api 80, e2e 226, e2e:fake 250, e2e:pwa 4; 292/292. **Staging:** TL-P3-08 (main 184bb76) renamed the Worker `bower-staging`, added the SPA fallback and a sensor pinning the name and the staging `BOWER_KV` id; the lead deployed from d5e4a74 (version 082fbde9). `/health` and `/me` answer 500 until the owner's Google secrets are set. Next: P3-B on the lead's word after the owner signs in.
- **Batch P3-5 ([TL-P3-09](DECISIONS.md)):** `worker-drive-token` closed (3673de3, real red, review CLEAN). `worker-vault-pointer` merged but BLOCKED by the Opus review (I1 mid-fill never completed, I2 two folders under concurrent first calls; gap `/me` folderId null). **Running:** fix round, `bower-escalated`, packet [2026-10-07-p3-5-vault-fix-packet.md](2026-10-07-p3-5-vault-fix-packet.md), `/private/tmp/bower-p3-vault2` branch `claude/p3-vault2`. Then close, suites, main, push, tell the lead to redeploy; then the owner's R2 session (draft packet in the coordinator scratchpad, to be committed as `2026-10-07-p3-b-r2-packet.md`).
- **Owed acceptance items (TL-P3-04 amendment, main 11d68fd):** `worker-google-oidc` stores and checks the session generation (`assertCurrentGeneration`) and wires `SESSION_SECRET_PREVIOUS` rotation; `worker-session-lease` adds lease expiry and leave-generation columns (schema v2 with a tested v1→v2 migration); the first route that reaches the person object answers `internal` with no cause on its errors; `worker-me-and-delete` checks the allowlist on every session (one KV read), so removal ends existing sessions. New modules go stub-first (METHOD step 6) so `done.sh` shows the red.

- Evaluations: fresh origin and bundle name checked (TL-P3-01).
- P2 evidence checkouts (`/private/tmp/bower-p2-*`) can be removed.
- Resume (TL-P2-45): never clear; after a compaction re-read HANDOFF and this file; a worker gone with no delivery is redispatched fresh from its packet.
