# Technical-lead decision TL-P3-2026-10-07-21: how the spine starts

**Coordinator questions, 2026-10-07:** where the manifest is built, where the spine code lives, where checkpoints go, and which model.

1. **The Worker builds the manifest at admission and stores it whole.**
   - **Building it.** Before entering the person object's synchronous section, the Worker reads the inbox and the pile declarations with the person's token, using `src/data/contracts` and `planRun`'s rules. These are metadata and Bower's own control files, never note content.
   - **Nothing to do.** An empty manifest answers 409 `nothing`, with the contract's three sentences, before any quota count.
   - **Otherwise** the run row stores the manifest itself: item ids, versions and pile declarations. A hash alone is not enough, and the token route hands the manifest to the runner.
   - **The runner takes exactly that set.** It re-checks each item still-as-seen. An item that changed since admission waits for the next run, which is never a failure.
   - This is the capture "by item ids and versions rather than a dynamic folder listing" that the R4 review recommended. It is also the contract's "A run takes the piles in the inbox when it starts".
   - The manifest is a few dozen bytes per item, far under a Durable Object row's limit. A cap on items per run already exists in `planRun`.
2. **The spine is extracted, not ported.** The orchestration in `src/data/fake/fake-runner.ts` is needed in two runtimes, the fake (demo and fake sources) and the real runner. So it moves into a shared module that takes a `FencedDrive`, a clock and an id source ([ARCHITECTURE](../ARCHITECTURE.md), "Reusable deterministic core": browser and runner adapters own I/O).
   - `fake-runner.ts` and `runner/src/spine/` both become thin callers.
   - Each spine entry extracts only the steps it touches, so nothing is reorganized wholesale.
   - A contract test runs the same plan through the fake drive and the real adapter.
   - A port would leave two copies to drift, which is the class of bug the reviews keep finding between the Worker and the fake.
3. **Checkpoints, as drafted.**
   - Each run's checkpoints live in `.bower/runs/<run_id>/`, written with `run-checkpoint.ts`.
   - At start, the runner reads only its own run's chain to resume.
   - The report barrier belongs to `spine-report-barrier-dispositions`.
   - The folders of finished runs are kept to the last 20, the same as the Worker's run history, and older ones go to the Drive Bin.
4. **Both entries run on `bower-escalated`** (data safety).
