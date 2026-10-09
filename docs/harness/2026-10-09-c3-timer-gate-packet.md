# Packet: c3-timer-gate (stage 3)

- **Entry:** `c3-timer-gate` (harness). Ruling: TL-P4-17 addendum 9 (main 925d3fbb). Defect `slow-ratchet-alone-under-load`. Worktree `/private/tmp/bower-c3-timer`, branch `c3-timer-gate` from `claude/p3`.
- **Starting model:** `bower-implementer` (Sonnet).
- **Live evidence:** the wall-clock ratchet failed under load twice, even after alone reruns (1008 ms and 1352 ms alone with another worker running). Wall clock measures the machine, not the test.

## Contract

1. **A vitest setup file** (in the app's, api's and runner's vitest config) fails any unit test that schedules a real `setTimeout` or `setInterval` of 100 ms or more while fake timers are off. The failure names the test and the call site.
   - Cite vitest fake timers (`vi.useFakeTimers`, `vi.isFakeTimers`) and the setup-files docs.
2. **The allowlist** `harness/real-timers.json` lists test names allowed today. It may only shrink, with an empty target. It replaces `harness/slow-tests.json`, which is deleted along with its rule and `SLOW_CEILING`.
3. **Wall-clock times** become a report from `check-harness.mjs`: the slowest tests are printed, never failed. The 5000 ms vitest timeout stays as the backstop.
4. **Remove the temporary alone margin** (`ALONE_MS`, entry `c3-alone-margin`) and the alone-rerun machinery (`scripts/harness-alone.mjs`) if nothing else uses it. Removed lines go on the card.

## Red

A fixture test with a real 150 ms wait, which fails the gate (it passes today). The same wait under fake timers passes.

## Verify (exact, from features.json)

`pnpm exec vitest run src/harness.test.ts src/timer-gate.test.ts -t` with:
- "a real wait of 100 ms or more fails the unit run"
- "a wait under fake timers passes the timer gate"
- "the timer allowlist may only shrink"
- "wall-clock times are reported, never failed"

Then `pnpm check` must be green on a loaded machine. Run it while another `pnpm check` runs, and say so on the card.

## Checklist

- Tests use fixtures; none runs the real suite inside vitest.
- Every printed message is backed by a test.
- Entries whose verify names a removed test get the new name. Report renames on the card.
- Commits: red, then fix, then notes in their own commit.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
