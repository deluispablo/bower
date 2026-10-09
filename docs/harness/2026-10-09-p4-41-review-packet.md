# Packet: P4-41 review (stage 3: c3-retention-race)

Starting model: Opus, fresh and read-only. Never start a server or run e2e; unit, runner and api tests only. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-ret`.

- **Diff:** `git diff bbc80e85..8301b03e -- runner src api` (red `bf1a72d6`, fix `8301b03e`; not merged).
- **Contracts:**
  - packet `docs/harness/2026-10-09-c3-retention-race-packet.md`;
  - DECISIONS TL-P4-14 addenda 14, 17 and 18 (retention: Bower-marked only, ≤3 Bins per run, the 24 h rule, every child must carry the mark);
  - TL-P4-17: promised behaviour is verified through the real entry point.
- **The fixed question:** second way? Your card must say "second way? no" or name it.
- **Look hardest at:**
  - each pick is listed just before its own Bin;
  - a folder that gains an unmarked child before its turn is kept;
  - a failure mid-loop is logged, never fails the run, and gives what landed;
  - the end stamp of this run is still written;
  - the goldens hold: C04 78, 25-runs 88;
  - the verify drives `keepFinishedAtEnd` as the runner calls it at run end.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-41-review-notes.md`.
