# Packet: P4-42 review (stage 3: c3-reservation-worker)

Starting model: Opus, fresh and read-only. Never start a server or run e2e; unit, runner and api tests only. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-wrk`.

- **Diff:** `git diff bbc80e85..f870bf07 -- api src runner scripts` (red `104707e3`, fix `53f92201`, notes `f870bf07`; not merged). Worker notes: `docs/harness/2026-10-09-c3-reservation-worker-notes.md`.
- **Contracts:**
  - packet `docs/harness/2026-10-09-c3-reservation-worker-packet.md`;
  - TL-P4-17 addenda 3 and 7 (Durable Object storage is the third keeper behind the write-once port; one release rule);
  - TL-P4-14 addenda 10, 11, 13 and 16;
  - TL-P4-11 (Worker subrequest budget);
  - AGENTS.md (no hard-delete; writes pass what they read).
- **The fixed question:** second way? Your card must say "second way? no" or name it.
- **Judge the worker's notices (behaviour changes on the Worker's own writes):**
  - a new folder's parent is now sent as `'root'`;
  - `.bower/*.json` is created as `text/plain`, where it was `application/json`;
  - text creates are now confirmed by the answer's md5.

  For each, say whether it is a listed fix, a harmless alignment with the app, or a forbidden change. Check that no reader (app, runner, Worker) selects by mime type or by the parent id value.
- **Also check:**
  - the allowlist went from 8 to 7, with growth failing;
  - the subrequest count per route is unchanged, apart from one Durable Object call after a refusal;
  - the stored ids are released on a 4xx and kept on retry, wait, quota and 409;
  - the verify drives the Worker route that makes the template;
  - the fake Worker still uses the same helper;
  - the goldens are unchanged.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-42-review-notes.md`.
