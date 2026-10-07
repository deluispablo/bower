# Technical-lead decision TL-P3-2026-10-07-14: the session lease goes live with its client; rate limits fold into admission

**Coordinator questions, 2026-10-07:**
- How does `worker-session-lease` avoid breaking the real app, whose client sends no epoch yet?
- What does `worker-rate-limits` cover?

## `worker-session-lease`: Worker and client in one entry

**Adopted as proposed** (`bower-escalated`: concurrency). The fence on `POST /vault` and the client that sends `x-bower-place`/`x-bower-epoch` ship in the same entry, so no staging deploy ever has one without the other. The entry delivers:
- **`POST /session`:** `{ place, action, gen }` → `{ active, epoch }`, following the [Worker contract](../specs/2026-10-04-worker-contract.md) "One active session" rules exactly.
- **Person object schema v6:** the beat time, plus the last leaving place and its leave generation per place, with a tested v5→v6 migration.
- **A `requireLease` middleware,** mounted on `POST /vault` now. `DELETE /me` and `POST /process` mount it in their own entries. A missing or stale epoch gets 409 `stale-session`.
- **The client wiring in `choose.ts`:** `place: { world: 'real' }`, plus a fake e2e.

**The leave generation is on the wire, not optional in effect.** The contract says each `check` and `leave` carries it. A body without `gen` counts as generation 0. A place with any recorded leave then discards that check, so leaving out the field can only refuse, never grant. A discarded check returns the current state and never grants.
- **The fake source sends `gen` too,** in the same entry. The fake mirrors the contract, so a fake without `gen` would hide the rule.
- **The contract test** shows a `check` that started before its place's latest `leave` is discarded, on both the Worker and the fake.

`session-lease-real` (P3-E) keeps the staging journey for C14: two windows, an outside Drive change while open, and `leave` on `pagehide`.

## `worker-rate-limits`: retired

- **The daily limit goes into `worker-process-admission`.** It is an atomic quota in the person object, counted in the same transaction that admits the run (`DAILY_RUN_LIMIT` = 100), with 429 `rate-limited` over it. The original kept it in KV, apart from admission, and its own comments document the race this avoids ([P3_DRAFT](../P3_DRAFT.md)).
- **No other limits in P3.** Staging serves an allowlist of two synthetic accounts. Per-address limits on `/auth/*` and per-person limits on `/drive/token` and `/vault` protect a public service, which is a P4 launch question. `security-review` records it as a P4 item, not a P3 finding. If P4 needs them, Cloudflare's [rate limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) is the standard way.

## Order

As proposed:
1. `worker-session-lease`.
2. `worker-me-and-delete`, which uses the fence.
3. `worker-process-admission` with the daily quota, and `worker-status-revision`.

All of these come after the P3-6 delta review, R4 and R3, with two workers at most.
