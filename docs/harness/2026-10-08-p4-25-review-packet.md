# Packet: P4-25 review (stage 2: c2-drive-transport)

Starting model: `bower-escalated` (Opus), fresh and read-only. Never start a server or run e2e; unit, runner and api tests only. Read only this packet, the rulings named here and the diff.

- **Diff:** `git diff a98d15a1..18f8a4da -- src runner api` plus the baseline commit `b918f830` (red `a2094dc9`, code `18f8a4da`; merged into `claude/p3`).
- **Contracts:** TL-P4-14 stage 2 (`c2-drive-transport` row; rules: behaviour unchanged except listed fixes, goldens never rise) and TL-P4-16 addendum 4 (one retry policy: a timeout per attempt, idempotent GETs retried with backoff inside a total budget, errors mapped by context, outside a browser never "offline"). AGENTS.md: every content write passes the modifiedTime it read; never hard-delete. Mechanism map: Drive transport; Drive ports.
- **The fixed question (TL-P4-15):** does the change add a second way to do something that already exists? The worker left WorkerHttp outside the transport: judge it. A yes blocks.
- **Look hardest at:** are writes ever retried without a fence or precondition (a retried PATCH, upload chunk or trash landing twice)? Does a retried GET still respect the attempt check and the fence in RunnerDrive? The browser GET now takes up to about 60 s before "offline" (was 30 s): a listed fix or a forbidden behaviour change for the app? Token refresh under concurrent 401s: one refresh? The Worker's vault.ts client removal: every Worker Drive call now through the transport with the subrequest budget (TL-P4-11) intact? Drive-call goldens (C04 runner, Home, admission) equal or lower.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-25-review-notes.md`.
