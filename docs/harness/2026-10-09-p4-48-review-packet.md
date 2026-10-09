# Packet: P4-48 review (v2-perched-bower)

Read-only and fresh. Unit and contract tests only: never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-v2-perched`.

- **Diff:** `git diff 52dac43e8139ee7a95257fb6f1fbc34372e56491..v2-perched-bower`. Red 26b4b60d, fix e2038262, compatibility 49c2c357, notes dde71f8f, fixture move 361cfd87 (TL-P4-22 addendum 12), notes b035cf7f.
- **Packet:** docs/harness/2026-10-09-v2-perched-bower-packet.md. Its contract follows TL-P4-22 addenda 6–9 after three contract passes (docs/harness/2026-10-09-v2-perched-bower-contract-review.md).
- **Fixed questions (TL-P4-20):** contract first, then second way. Look for a second animation system, a second presence registry, a second carry, or a second listener home. Give every finding a severity.
- **Look hardest at:**
  - The engine-owned bird carries no `posed` classes. Losing the turn restores `posed <pose> still`.
  - Presence ignores minor birds for both activeId and topPriority, and a minor bird still hides under an overlay bird.
  - Each pose runs a fixed script, never `idle()`, `look()` or `turn()`.
  - `peck` and `showOff` take options, and there is no new loop action.
  - The pose-loop test reads pose-reference.fixture.ts, and its tolerances match addendum 7 and 9: period ±10% without blink, peaks ±20% or 2 px, scale ±20% of the excursion, rest 1 px or 0.02, land exempt only from the perch bounds.
  - Sleep keeps its eyes closed through the blink spring. Moves off or reduced motion mounts no engine.
  - The injected scheduler and random source are test-only and default to rAF and Math.random. No real timers (c3-timer-gate).
  - The inner wrapper leaves the caller's className and style on the outer div.
  - `useBirdTurn` returns `{ turn, setHandle }`, and `activeHandle()` is exported.
  - The baseline only shrank (six rows removed), and knip excludes the fixtures the same way dependency-cruiser does.
  - The `tests changed:` lines, with no `.only` or `.skip`.
- **Reply:** the review card from `docs/harness/WORKER.md` (PASS or BLOCK), with lines under 120 characters. Put the details in `/private/tmp/p4-48-review-notes.md`.
