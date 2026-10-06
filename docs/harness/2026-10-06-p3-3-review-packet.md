# Packet: batch review of P3-3 (worker-crypto-session, worker-person-object)

Starting model: `bower-escalated` (Opus), fresh, read-only. Reason: [TL-P2-46](2026-10-06-tl-p2-46-review-fallback.md) fallback until Codex returns on 2026-10-12 ([TL-P3-04](2026-10-06-tl-p3-04-batch-p3-3.md)). Counters: read only this packet, the two implementation packets, the contract and the diffs, never the workers' deliveries; assume the code is wrong until a test or a reading proves otherwise; each Critical/Important finding names the failing scenario and the missing or weak test.

- **Diffs (do not edit or commit there):**
  - crypto-session: `git -C /private/tmp/bower-p3-crypto diff 679baa9 4e0bde7`, packet [2026-10-06-p3-3-crypto-session-packet.md](2026-10-06-p3-3-crypto-session-packet.md); the original it reuses is in `/Users/deluisp/Projects/bower/api/`.
  - person-object: `git -C /private/tmp/bower-p3-person diff 679baa9 8c7ae52`, packet [2026-10-06-p3-3-person-object-packet.md](2026-10-06-p3-3-person-object-packet.md).
- **Contract:** `docs/specs/2026-10-04-worker-contract.md` on main (`/Users/deluisp/Projects/bower-app`), including the general-codes table of TL-P3-05. Already known and scheduled for the fix round, so do not re-report: `config` must become `internal` (no cause in a 500), and `PENDING_CONTRACT_CODES` must empty against the table.
- **Focus:** crypto (IV uniqueness, AEAD tag handling, key derivation and length, constant-time compare), session (signature verification before trust, `sub` keying, generation bump really retires old cookies, rotation window bounded, cookie attributes), CORS and error responses; Durable Object (all access serialized through the object, `blockConcurrencyWhile` migration, the schema-version refusal of newer storage, SQL injection or unparameterized queries, isolation by `idFromName(sub)`), and whether each test can fail for the stated reason.
- **Research first:** cite Web Crypto/NIST for AES-GCM, OWASP for sessions, Cloudflare's Durable Object docs, when a finding rests on them.
- **You may** run `pnpm -C api exec vitest run` in either checkout, output to `/tmp/p3-3-review-*.log`; throwaway tests only under `/tmp`.
- **Deliver, under 30 lines:** verdict per entry (CLEAN / BLOCKING), blocking findings, minors one line each.
