# Technical-lead decision TL-P3-2026-10-07-19: where the runner lives, and its Drive adapter

**Coordinator questions, 2026-10-07:** where the runner's code lives, and the scope of `runner-drive-adapter`.

1. **The runner lives in `runner/`,** a pnpm workspace package beside `api/`. It is TypeScript on the current Node LTS, pinned with `actions/setup-node` in the workflow. It imports the pure core from `src/data/contracts` (the shared-domain package) and publishes nothing ([ARCHITECTURE](../ARCHITECTURE.md), "Reusable deterministic core"). The instance repository receives a built single-file bundle plus its workflow, never the source. The adapted `new-instance.sh` copies them (TL-P3-13). The original's `agent/` is copied only where a spine entry needs it.
2. **The adapter reuses the app's Drive client.** The runner's real `FencedDrive` (createFolder, createText, update, trash, writeText, plus the evidence reads get, list, readText and md5) is built on `src/data/drive/drive-http.ts`. It uses Node's built-in `fetch`, and the token comes from `GET /runner/runs/:id/token`. A second Drive client would duplicate the request shapes, the modifiedTime check and `stillAsSeen` that the app and the Drive suite already proved on real Drive. Any browser-only line in `drive-http.ts` is moved behind its injected dependencies in this entry, without changing the app's behaviour.
   - **Before each write:** a still-as-seen read (modifiedTime, name, parents), as the app does. This is a precheck, documented as not compare-and-set (ARCHITECTURE, "Safety at the actual storage boundary", and the R1 limitation).
   - **Faults** are injected through the fetch hook, as in the fake.
3. **Tests, as drafted.** Unit tests run against a fake fetch that replays Drive v3 shapes. One contract test runs the same scenario against the fake's `FencedDrive` and against the adapter. No real Drive in this entry.
4. **The attempt check reuses the token route's `attempt`,** re-read once per write batch. There is no new route. A stale attempt is also refused at its next status report (409 `stale-attempt`), so a batch can be wasted but can never finalize.

## Amendment, 2026-10-07: check the attempt before every fenced write

Rule 4's "once per write batch" is replaced: the runner reads the attempt from the token route **before every fenced write**. In `spine-recovery-without-browser`, an attempt 1 woken after a takeover created a second folder inside one batch. One extra Worker call per write is cheap next to a duplicate in the person's folder. This is still a precheck, not compare-and-set: the window between the check and the write is the documented R1 limitation.

The first real run on Actions also showed that `run_worker_first` lacked `/runner/*`, so the token route answered the app page with a 200. `staging-runner-routes` adds the pattern and a test that every mounted Worker route runs the Worker first. After it, P3-13 closes and the first-run journey reruns. A run whose runner cannot fetch its token waits until the stale deadline; that, and one press sending two idempotent `/process` calls, go to polish.
