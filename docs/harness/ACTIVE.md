# Active work (coordinator only)

Earlier log: [archive](archive/2026-10-06-active-before-tl-p2-41.md). Token ledger: `harness/tokens.csv`.

P2 closed at `00ec9a5` ([dossier](2026-10-06-p2-dossier.md)). **P3 started** ([TL-P3-01](2026-10-06-tl-p3-01-p3-start.md), P3_DRAFT adopted). Integration branch `claude/p3` (from main 93d70e9), checkout `/Users/deluisp/Projects/bower-app`. Staging from 605bbaa (ec070ce8).

- **Batch P3-1 closed** at `be87050`: c11 + console guard (+ scoped `allowConsole` in six failure-path tests, qa26 stub fix). Suites: check 3492, e2e 226, e2e:fake 250, e2e:pwa 4. 284/284.
- **Batch P3-2 closed** at `541c26c`: `shared-domain-package`, `worker-skeleton`, `done-sh-api-paths` (TL-P3-03; Haiku attempt rejected, Sonnet climb). Suites: check 3496 + api 4, e2e 226, e2e:fake 250, e2e:pwa 4; harness 287/287.
- **Batch P3-3, running ([TL-P3-04](2026-10-06-tl-p3-04-batch-p3-3.md)):**
  - `worker-crypto-session`, `bower-implementer`, packet [2026-10-06-p3-3-crypto-session-packet.md](2026-10-06-p3-3-crypto-session-packet.md), `/private/tmp/bower-p3-crypto` branch `claude/p3-crypto` (TL-P3-03 folded in).
  - `worker-person-object`, `bower-escalated`, packet [2026-10-06-p3-3-person-object-packet.md](2026-10-06-p3-3-person-object-packet.md), `/private/tmp/bower-p3-person` branch `claude/p3-person`.
  - `worker-crypto-session` delivered 4e0bde7 (api 48/48). [TL-P3-05](DECISIONS.md) (main a8e5d66): the contract's general-codes table (signed-out 401, forbidden 403, not-found 404, payload-too-large 413, unsupported-media-type 415, rate-limited 429, internal 500); `config` is refused as a client code (missing config/secret answers `internal`, the detail goes to the log only). The fix round after the review maps `config` to `internal`, empties `PENDING_CONTRACT_CODES`, and ideally reads the allowed list from the contract table.
  - Then one Opus review over both diffs (TL-P2-46), integrate (both touch `api/src/index.ts`/`env.ts`: resolve by hand), `done.sh` with a real red, four suites, main, push. Next P3-4: `worker-google-oidc` and the first staging deploy; tell the lead when ready for the owner's sign-in.

- Evaluations: fresh origin and bundle name checked (TL-P3-01).
- P2 evidence checkouts (`/private/tmp/bower-p2-*`) can be removed.
- Resume (TL-P2-45): never clear; after a compaction re-read HANDOFF and this file; a worker gone with no delivery is redispatched fresh from its packet.
