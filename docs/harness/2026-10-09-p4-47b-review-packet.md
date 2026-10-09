# Packet: P4-47b review (c3-state-mark rounds 3 and 3b)

Read-only and fresh. Unit, runner, api and contract tests only: never start a server, run e2e or call the claude CLI. Never check out the main repo in any form. Run git with `-C /private/tmp/bower-c3-state`.

- **Diff:** `git diff e03c72b4..cab42f23` shows the whole entry against claude/p3 (e03c72b4 is the claude/p3 parent of the last merge, d3977010). List the entry-only commits with `git log --first-parent --no-merges 1d2e5a26..cab42f23`.
  - Round 3: red e5301fc3, fix d824059e, notes dc0cf890.
  - Round 3b: red dcb46f11, fix abca07ea, e2e 107e2da1, notes 0d212bd7 and cab42f23.
- **The previous review** (P4-47, BLOCK; /private/tmp/p4-47-review-notes.md) found that the stamp+md5 re-ask (`held`) had no test. Check that the new test fails when `held` is removed.
- **Rulings:**
  - TL-P4-19 addendum 12: a clash re-asks with the one new sentence, which replaces STATE_ASK_AGAIN. A permanent refusal and "nothing to write" become answered rows on Home and on the note, with the exact copy and the fallback "the note".
  - Addendum 13: a scripted-provider grant scenario, never reachable from the live path (the dependency-cruiser rule), and one e2e:fake test.
  - Addendum 15: the runner's end status says an answer stayed. The Worker then schedules a dispatch-now deadline through the existing admission path, and only the alarm dispatches. A raced clash re-asks with the same new sentence.
  - Lead: use the one manifest reader (parseRunManifestV2) unless there is a real reason not to.
- **Fixed questions (TL-P4-20):** contract first, then second way. Is there a second dispatch path in api/src (person.ts, runner.ts, run-ticket.ts)? A second manifest reader? A second stamp comparison? Give every finding a severity.
- **Look hardest at:**
  - The Worker change. Does the "an answer stayed" status reuse the existing waiting-answers deadline, or add a new alarm? Can it loop? A re-ask uses the answer up.
  - The new 415 path for a report that says an answer stayed: is it additive, and does an old runner still work?
  - The `__editAtWrite` fake hook and `write-it.ts` stay in the fake and scripted provider, and are unreachable from `?source=real`.
  - The `tests changed:` lines, no `.only` or `.skip`, the compatibility rows, and the goldens (C04 78, 25-runs 88).
- **Reply:** the review card from `docs/harness/WORKER.md` (PASS or BLOCK), each line under 120 characters. Details go in `/private/tmp/p4-47b-review-notes.md`.
