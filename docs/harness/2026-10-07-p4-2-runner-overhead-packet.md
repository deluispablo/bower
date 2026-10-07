# Packet: runner-overhead (P4-2, bower-implementer)

[TL-P4-01 addendum](2026-10-07-tl-p4-01-p4-start.md); the owner's speed request is in [p4-speed-baseline](p4-speed-baseline.md). A scripted tidy-up with no model took 2 min 07 s end to end on staging (run `37629481616`, and others since). The original's goal for a tidy-up of one to three files was about 1.5 to 2 minutes with the model. Target: a scripted run **under 60 s** end to end, with no safety lost.

- **Research first:** cite the documented way to cut Drive round trips (Drive v3 batch requests, `fields` and `pageSize`, listing a folder once) and the GitHub Actions job start-up costs (setup-node cache, install), before changing anything. Reuse what the runner already has.
- **Read:**
  - `runner/src/spine/run.ts`, `runner/src/drive.ts`, `runner/src/effects.ts`, `runner/src/status.ts`, `runner/src/token.ts`, `runner/src/retry.ts` and `runner/src/main.ts`;
  - `runner/workflows/tidy.yml`;
  - the job logs' timings: ask the coordinator, never run `gh` yourself.
- **Do:**
  1. **Profile.** Add one timing line per run, phase by phase (job, token, plan reads, apply, checkpoints, report, status), with numbers only. `claude-provider` adds the model fields to the same line; coordinate through one helper. Measure a scripted run on the real adapter's Drive fake, with a modelled per-call latency (about 150 ms per Drive call, 80 ms per Worker call).
  2. **Cut, safest first:**
     - repeated listings and metadata reads (cache within the attempt);
     - token grants (reuse until near expiry);
     - checkpoints written more often than recovery needs;
     - attempt checks repeated within one batch;
     - workflow start-up (cached install, no unused steps).
  - **Never cut:**
    - the attempt fence before each write;
    - still-as-seen before each write;
    - the read-back reconcile;
    - the report barrier order.
- **Named tests (runner):**
  - `a scripted run with modelled Drive latency finishes under the runner budget`. Fake timers or a modelled clock; the budget is 60 s for the C04 corpus case `c04-offer-and-flat`.
  - `the runner overhead cuts keep recovery and ordered status`. The recovery, ordered-status, dispositions and network-retry suites run unchanged and green.
- **Rules:**
  - Work in the checkout and branch in your prompt. Never push, deploy or make a live call.
  - Red tests first, then the cuts in one or a few commits. Gates: the verify, the runner suite in full, `pnpm check`.
  - `claude-provider` works in `runner/src` at the same time. Keep out of `runner/src/provider*` and any Claude files.
- **Reply:** the implementer delivery card, every line under 120 characters (TL-P3-29), with the before and after times per phase. Details go in a notes file.
