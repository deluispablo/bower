# Technical-lead decision TL-P4-22: stage 3 pattern review and pruning

**Input:** the coordinator's [stage 3 end inputs](2026-10-09-stage3-end-inputs.md) (claude/p3 17707cf5). Main and backup are at 55ea8194, and all six suites are green with no flaky test. The procedure is TL-P4-15: read the stage's defects together, a class seen twice becomes a base improvement, and a rule broken by hand twice becomes a machine check.

## Rulings

1. **A ruling's code premise cites file and line (the lead's own defect, 4 times).**
   - **What went wrong:** addenda 11(b), 19, a16 and a18 stated what the code does, and each was false. The workers stopped and asked each time, which is the method working, but each mistake cost a round.
   - **New rule:** every sentence in a ruling that says what code does now ("X already does Y", "the engine allows", "the listing reads") cites `file:line` at the ruling's commit, and the lead reads those lines before writing the sentence.
   - **When a cheap read is not enough:** if the premise needs more than a few files, the lead dispatches `bower-impact` or `bower-diagnoser` first.
   - **The worker's side:** a worker that finds a cited premise false stops and asks, as now.
   - **Where it lives:** the technical-lead brief.
2. **The designer signs off the UI part of a packet before dispatch (`ui: true`).**
   - **What went wrong:** six of six UI gaps were found only at the design check, after a review PASS, because the reviews judge the packet's contract and the gaps sat outside it.
   - **New rule:** the packet for a `ui: true` entry has a "What the person sees" section with:
     - each screen and state;
     - every exact string, including errors, the fallbacks and the answered rows;
     - what each control does.

     The coordinator sends that section to the designer, who answers `ok` or corrections before dispatch. The review then judges those strings as part of the contract.

   - **Where it lives:** packet-template, the coordinator and designer briefs, the bower-review skill.
   - **Measure:** design-check findings per `ui: true` entry in stage 4.
3. **Hook tests use real hook input.**
   - **What went wrong:** stop-gate-wrong-tree, and the push guard matching quoted text.
   - **New rule:** a hook test's input is copied from a recorded live hook input (`cwd`, `tool_input`, `last_assistant_message`), never written from the docs alone. A test that feeds an invented field fails review.
   - **Restarts:** a change to a hook or to agent frontmatter goes live only after the affected sessions restart (agent-defs-not-live-mid-session), so the entry's close names that restart.
   - **The push guard:** its quoted-text false positive becomes a small stage 4 entry, `c4-push-guard-quotes`, with real input. It is fail-safe meanwhile.
   - **Where it lives:** the WORKER checklist.
4. **Load timeouts.** The size-cap and per-thing-ask unit timeouts under load get one diagnosis together, under the real-timer gate class. The coordinator dispatches `bower-diagnoser` with both, and the fix goes with `c4-test-timers`.

## Pruning (TL-P4-20 trial)

**Adopted for stage 4:** a fix round skips the re-review when all of these hold:

- the entry is `ui: true` and not escalated;
- the round changes only files under `src/features/`, `src/ui/`, `src/styles/`, plus their tests;
- the round is at most about 150 changed lines;
- nothing under `src/data/`, `runner/`, `api/` or the contracts changes.

The test-tamper gate, done.sh's red→green and the designer's `verified` still apply. The coordinator marks such a round `review: skipped (TL-P4-22)` in the notes.

**Measure and stop rule:** count later defects traced to a skipped round. The trial ends at the first one.

**Kept, with the evidence:**

- the designer's check: 6 of 6 real gaps;
- the escalated reviewer on logic rounds: the P4-47 BLOCK, and the 47b minors that became a contract gap;
- the diagnoser.
