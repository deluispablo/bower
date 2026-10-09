# Stage 3 end: inputs for the lead's pattern review and pruning (coordinator, 2026-10-09)

Main = backup = 55ea8194. The suites ran with E2E_BATCH=1 and none was flaky:

| Suite | Passed |
| --- | --- |
| check: unit | 3905 |
| check: api | 235 |
| check: runner | 259 |
| e2e | 226 |
| e2e:fake | 263 |
| e2e:pwa | 4 |

## Cost by role (harness/tokens.csv, the rows logged on 2026-10-09)

Rows exist only from TL-P4-20 onward. Earlier dispatches today have no row.

| Role | Runs | Tokens | Minutes | Tool uses |
| --- | --- | --- | --- | --- |
| implementer (Sonnet and escalated) | 19 | 2,669,751 | 158.7 | 883 |
| reviewer | 6 | 505,861 | 8.0 | 89 |
| diagnoser | 2 | 150,093 | 5.2 | 35 |
| mechanical | 2 | 135,096 | 3.1 | 15 |
| design-checker (role check) | 1 | 19,841 | 0.1 | 3 |

By entry:

| Entry | Tokens | Runs |
| --- | --- | --- |
| c3-state-mark | 1.29 M | 7 implementer rounds |
| c3-pair-ask | 0.62 M | 4 rounds |
| c3-agent-defs | 0.19 M | |
| c3-flaky-policy | 0.17 M | |
| c3-hooks | 0.17 M | |
| c3-test-tamper | 0.09 M | |

## What found what (stage 3 tail)

**The designer's check** found 6 real gaps after review PASS:
- not-merged-never-shown;
- answered-rows-unlabeled;
- pair-row-always-fallback;
- write-it-blind-yes;
- timeline-before-yes (by design);
- the final copy.

No review caught them, because the reviews judge the packet's contract, and the gaps sat outside it: what the person sees.

**Reviews:**
- P4-47 BLOCK: an untested `held`.
- P4-47b PASS, but with 3 minors that the lead ruled a contract gap: an unbounded loop.
- P4-46b, 46c, 46d and 47c PASS, with minors only.

**Workers who stopped and asked** rather than guessed, 5 times. Each time the premise in a ruling was false:
- addendum 11(b): the trashed name was never read;
- addendum 19: "used up" was blocked by the engine;
- the a16 channel;
- the a18 home;
- the stop gate's `cwd` (diagnosed).

**The harness itself:**
- stop-gate-wrong-tree: tests fed a hook input that no live worker gets;
- agent-defs-not-live-mid-session: frontmatter hooks load at session start;
- push-guard-matches-quoted-text;
- two unit timeouts under load: size-cap and per-thing-ask, both still to diagnose.

## Patterns for the lead's list

1. **Hook tests use real hook input** (the lead's rule): record the input once from a live run, then use fixtures copied from it.
2. **A ruling that names code behaviour was wrong 4 times in this stage** (11(b), 19, a16, a18).
   - Candidate: before a ruling that says "X already does Y" is dispatched, a short read-only check of that sentence against the code. The impact role could do it, or the coordinator's map.
3. **What the person sees is outside the review contract.** Every UI gap came from the designer, not the reviewer. Candidate: the packet for a `ui: true` entry lists the exact strings and screens the person sees, so the review can judge them too.
4. **Load flakes:** unit tests time out while a worker's e2e runs next to `pnpm check`. Two this stage. Candidate: diagnose both together, under the timer-gate class.

## Pruning candidate (TL-P4-20 trial; the lead decides)

- **Re-reviews of small UI fix rounds that the designer checks afterwards.** P4-46c and 46d PASSed with minors only, and the designer then found or confirmed the real issues. A UI-only fix round under about 150 changed lines could skip the re-review and rely on the designer's check plus done.sh's red→green. Measure: later defects in those rounds.
- **Keep:**
  - the designer's check: 6 of 6 real UI gaps;
  - the escalated reviewer on logic rounds: P4-47 BLOCK, and P4-47b's minors became a gap;
  - the diagnoser: its one diagnosis was decisive.
