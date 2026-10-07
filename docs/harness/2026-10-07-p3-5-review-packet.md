# Packet: batch review of P3-5 (worker-drive-token, worker-vault-pointer)

Starting model: `bower-escalated` (Opus), fresh, read-only. Reason: [TL-P2-46](2026-10-06-tl-p2-46-review-fallback.md) fallback until Codex returns on 2026-10-12. Counters: read only this packet, the two implementation packets, the contract and the diffs, never the workers' deliveries; assume the code is wrong until a test or a reading proves otherwise; each Critical/Important finding names the failing scenario and the missing or weak test.

- **Diffs** (read-only; the integration checkout `/Users/deluisp/Projects/bower-app`, do not edit or commit):
  - drive-token: `git diff 28fe291 ac8f5a8` (stub `dec4f97`), packet [2026-10-07-p3-5-drive-token-packet.md](2026-10-07-p3-5-drive-token-packet.md).
  - vault-pointer: `git diff ac8f5a8 d923aeb` (stub `ae96aee`), packet [2026-10-07-p3-5-vault-pointer-packet.md](2026-10-07-p3-5-vault-pointer-packet.md). The original it adapts: `/Users/deluisp/Projects/bower/api/src/vault.ts`.
- **Contract:** `docs/specs/2026-10-04-worker-contract.md` (`GET /drive/token`, `POST /vault`, `DELETE /me`, general codes) and, for what the app reads from a new folder, `src/data/contracts/` (`rules-format`, `note-format`, the `.bower/` record shapes).
- **Focus:**
  - drive-token: refresh flow, `invalid_grant` handling and the generation bump, expiry cap, cache freshness, the unencrypted cached access token in the person's database, no token in logs or answers beyond the route, the allowlist read on every session and logout's behaviour for a removed address, the v2→v3 migration, the `no-folder` message (is it in the contract?).
  - vault-pointer: never deletes or overwrites; idempotence after a lost reply; **concurrent first calls** (two tabs, two folders?) and whether the person Durable Object should serialize creation; **a crash mid-fill** leaving a marked but incomplete folder that is never completed; **template content vs what the app parses** (`Rules.md`, `About me.md`, `.bower/*.json` against `src/data/contracts`); the marker (`appProperties.bowerFolder`) and its visibility rule; a pointer to a binned folder; Drive error mapping (no cause in answers).
- **Research first:** cite Google OAuth refresh-token docs, Drive v3 `files.create`/`files.list`/`appProperties`, and Cloudflare Durable Object concurrency when a finding rests on them.
- **You may** run `pnpm -C api exec vitest run` in the integration checkout, output to `/tmp/p3-5-review-*.log`; throwaway tests only under `/tmp`.
- **Deliver, under 30 lines:** verdict per entry (CLEAN / BLOCKING), blocking findings, minors one line each.
