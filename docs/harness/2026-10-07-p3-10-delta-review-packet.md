# Packet: P3-10 delta review (admission manifest, operations and checkpoints)

Starting model: `bower-escalated` (Opus), fresh and read-only. Reason: the TL-P2-46 and TL-P3-16 fallback at the batch close. What a run may touch, the Worker reading Drive with the person's token, and a runner that resumes and never applies an operation twice are data-safety work. Counters: read only this packet, the packets below and the diffs, never workers' deliveries. Assume the code is wrong until a test or a reading proves otherwise.

- **Diffs:** `git diff b83dc98..<HEAD in your prompt> -- src api runner scripts`. Per change:
  - `d1f69b8` (pure journal-record and run-wire checks moved under `src/data/contracts/`; `api/tsconfig.json` to Bundler resolution);
  - `e711008` (shared admission plan; stubs `6cc6453`);
  - `1ce428c` (runner takes exactly the admitted set);
  - `e52bdfd` (the Worker builds the manifest; schema v8→v9, the run row keeps it; the token route returns it);
  - `a21d753` (the architecture rule now lets `api/` import `src/data/spine` and the Drive adapter);
  - `11c0409` (shared run records, runner checkpoints, resume, retention; stubs `fd130bd`).
- **Contracts:**
  - [TL-P3-21](2026-10-07-tl-p3-21-spine-start.md);
  - the "Runner wire" and `POST /process` sections of `docs/specs/2026-10-04-worker-contract.md`;
  - the packets `2026-10-07-p3-10-admission-manifest-packet.md` and `2026-10-07-p3-10-operations-checkpoints-packet.md`.
- **Look hardest at:**
  - **Admission.**
    - The manifest is built before the person object's synchronous section. Can two presses, a repeat, or a run that ends in between admit a run with no manifest, a stale one, or the other press's manifest? Check the `wouldAdmit` → `admit` → `needs-manifest` retry.
    - Does an empty manifest answer 409 `nothing` before any quota count, every time?
    - Does a Drive error ever leak its cause to the reply? Is the person's token never logged?
    - Is the v8→v9 migration additive, keeping every v8 row?
  - **Runner intake.**
    - Does the runner take exactly the admitted set, never more?
    - Is an item changed since admission deferred, never failed and never processed?
  - **Records and checkpoints.**
    - Can a restarted runner apply an operation twice? Check the intent checkpoint before each send, the evidence read, and a possibly-sent operation with no evidence.
    - Do the fake and the runner really share one chain?
    - Does retention keep exactly the last 20 finished run folders and only ever move older ones to the Bin, never delete? Can it touch a running run's folder, or anything outside `.bower/runs/`?
  - **The api import rule.** Does the spine's closure stay free of browser and environment globals? The known `vault/seen.ts` exception: is it really never reached from the spine?
- **Run:** single test files only (`pnpm exec vitest run <file>`, `pnpm -C api exec vitest run <file>` or `pnpm -C runner exec vitest run <file>`), one at a time. Reproductions go under `/private/tmp/p3-10-review/` in your own worktree, which you remove afterwards.
- **Reply:** the review card in `docs/harness/WORKER.md`.
