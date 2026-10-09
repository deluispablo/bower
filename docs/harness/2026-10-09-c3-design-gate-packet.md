# Packet: c3-design-gate (stage 3)

- **Entry:** `c3-design-gate` (harness). Ruling: TL-P4-18 addendum 3 (DECISIONS:185; coordinator brief, designer bullet). Worktree `/private/tmp/bower-c3-design`, branch `c3-design-gate` from `claude/p3`.
- **Starting model:** `bower-implementer` (Sonnet).
- **Ruling sweep:** TL-P4-18 and its addenda 1-3. This is the same pattern as `c3-integrate-gate`'s review rule (TL-P4-17 entry 1), and it reuses that one home.

## Contract

- **Fields.** `harness/features.json` entries gain optional `ui` (boolean) and `design` (the string `"verified"`).
- **One rule.** `scripts/harness-rules.mjs` refuses `passes: true` for an entry with `ui: true` unless `design` is `"verified"`. It sits in the same rule function as the escalated-review check, not in a second checker. `harness/done.sh` uses it and stops before closing.
- **Mark c3-pair-ask.** Set `ui: true` on `c3-pair-ask` (it is open, so nothing breaks).
- **Closed entries stay closed.** Closed entries are not marked. The rule applies to entries marked `ui` from now on.

## Red

Fixtures failing today:
- "a ui entry cannot pass without a verified design check"
- "done.sh refuses to close a ui entry with no verified design check"
- "an entry without ui needs no design check" (a guard: it passes today and must stay green)

## Verify (exact, from features.json)

`pnpm exec vitest run src/harness.test.ts src/harness-git.test.ts -t` with the three names above. Then `pnpm check` must be green.

## Checklist

- No real timers of 100 ms or more.
- Every printed line is backed by a test.
- Commits: red, then fix, then notes in their own commit.
- Reviewers: read-only; no checkout of the main repo in any form.
- Reply: the WORKER.md card, lines under 120 characters; details in a notes file.
