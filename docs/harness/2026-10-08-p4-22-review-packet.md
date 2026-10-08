# Packet: P4-22 review (stage 1: c1-worker-deadlines)

Starting model: `bower-escalated` (Opus), fresh and read-only. Never start a server or run e2e; unit and api tests only (TL-P4-13). Read only this packet, the rulings named here and the diff.

- **Diff:** `git diff 71562b95..1461f5f9 -- api` (red `ffc19d0a`, code `1461f5f9`, merged into `claude/p3`).
- **Contracts:** [TL-P4-14](2026-10-08-tl-p4-14-consolidation.md) "Rules for every consolidation entry" (behaviour unchanged except the listed fixes) and the `c1-worker-deadlines` row. Mechanism map in `docs/ARCHITECTURE.md`: Worker deadlines. Cloudflare Durable Objects alarms (one alarm per object; setAlarm overwrites).
- **The fixed question (TL-P4-15):** does the change add a second way to do something that already exists? A yes blocks.
- **The worker's own list of behaviour differences** (`/private/tmp/bower-c1-deadlines-notes.md`, section "Behaviour differences"): each handler now runs only when its own row is due (the old wake ran recover and startWaiting on every alarm; an incidental retry of stopped answers is gone); a throwing handler now moves its due rows a minute later instead of the runtime's 2 s backoff retries. Judge each: a listed fix, harmless, or a behaviour change the rules forbid.
- **Look hardest at:** schema v12 forward migration (pending deadlines moved, nothing lost on live objects); compare-and-delete of handled rows; Delete me wiping every deadline and the gone-ticket rows expiring on time; no tight loop on a throwing handler; rearm always run (finally).
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-22-review-notes.md`.
