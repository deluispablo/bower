# Packet: c3-test-time (stage 3)

- **Entry:** `c3-test-time` (test). Ruling: TL-P4-17 entry 3 ([doc](2026-10-09-tl-p4-17-stage-2-pattern-review.md)). Worktree `/private/tmp/bower-c3-time`, branch `c3-test-time` from `claude/p3`.
- **Starting model:** `bower-implementer` (Sonnet). Tests and harness only; production code changes only to take an injected clock or option that already exists.
- **Live evidence:**
  - dependency-rules timed out at 5000 ms under load (DEFECT_LOG dependency-rules-timeout);
  - lost-bytes ran 3–4.4 s from the real transport backoff ([diagnosis](defects/2026-10-09-lost-bytes-slow.md));
  - 16 unit tests run over 1000 ms in `test-results/unit.json` at 0cc1247a. The slowest are "report save failure cannot publish done…" at 9.1 s, dependency rules at 3.5 s, and the read-cache and Home latency-fake tests at about 2.5 s.

## Contract

1. **Real waits.** Tests of backoff, deadlines and toasts take the injected clock, the transport options from `c2-transport-options`, or vitest fake timers. Never loosen an assertion to make a test fast.
2. **Dependency rules.** `src/dependency-rules.test.ts` stops running dependency-cruiser, because `scripts/check-dependencies.mjs` already runs it in `pnpm check`. Keep only a fast unit test of the rule list (the rules exist once).
3. **Ratchet.** `scripts/check-harness.mjs` already reads `test-results/unit.json`.
   - A unit test over 1000 ms fails unless it is in `harness/slow-tests.json`.
   - That list may only shrink, the same pattern as `harness/duplication-baseline.json` with `check-duplication-gate.mjs`.
   - The baseline is today's list minus every test this entry speeds up.
4. **Out of scope:** qa10 (stays with `c4-focus-return`) and e2e timing.

## Red

Write each test first; each fails today:
- a slow fixture not on the list fails the check;
- adding a name to the list fails;
- lost-bytes asserts that it finishes under a bound with zero backoff injected.

## Verify (exact, from features.json)

`pnpm exec vitest run src/harness.test.ts src/dependency-rules.test.ts src/data/upload-queue-real.test.ts -t` with:
- "a unit test over 1000 ms not on the slow list fails the harness check"
- "the slow list may only shrink"
- "the rule list names every forbidden import"
- "lost bytes ask to choose the file again"

Then `pnpm check` must be green. Run it twice and report the slow-list size both times, so the ratchet is not itself flaky under load.

## Checklist

- Tests wait for events, never for time.
- Every printed message is backed by a test.
- The card names the exact verify tests, the slow-list size before and after, and `removed: <lines>`.
- Research first: cite vitest fake timers and Martin Fowler's "Eradicating non-determinism in tests".
- Reviewers: read-only, unit tests only, never `git checkout` in the main repo.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
