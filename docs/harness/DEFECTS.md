# When something fails: the defect workflow

Adopted under [TL-P4-15](2026-10-08-tl-p4-15-defect-workflow.md), at the owner's request, 2026-10-08. A defect is never patched where it shows. It is understood first, and then the design decides where the fix belongs. Each defect is a chance to improve the code around it.

## What counts as a defect

- A live or staging failure.
- A failing suite that the current diff did not cause.
- An evaluator finding.
- A review finding outside the entry's own contract.
- A review finding on the entry's own diff that shows its design is wrong, or that touches another mechanism.

A review finding inside the entry's contract, about its own new code, is still fixed in a fix round of that entry under the same design.

## The flow

1. **Log it; don't fix it.** The coordinator adds one line to [DEFECT_LOG.md](DEFECT_LOG.md): the date, a short id, what was seen (evidence: SHAs, run ids, log lines), its severity, and `status: diagnosing`. It starts no fix.
2. **Diagnose the root cause.** The coordinator dispatches `bower-diagnoser`: Opus, read-only, a fresh session. It writes `docs/harness/defects/<date>-<id>.md`, at most one page, with:
   - **what failed:** the evidence, reproduced or quoted;
   - **why:** the "5 whys" down to the cause in the design, not the line that threw ([Google SRE, postmortem culture](https://sre.google/sre-book/postmortem-culture/));
   - **owner mechanism:** which entry of the [mechanism map](../ARCHITECTURE.md#mechanism-map) owns this behaviour, or "none";
   - **same class elsewhere:** other places with the same kind of defect, with file:line;
   - **options:** (a) fix inside the owner mechanism; (b) refactor first, then fix ("make the change easy, then make the easy change", Kent Beck; [Fowler, preparatory refactoring](https://martinfowler.com/articles/preparatory-refactoring-example.html)); (c) a new mechanism, only when none exists. Each option gives its size and risk;
   - **regression test:** the test that catches the whole class, not only this case.
3. **The lead decides the design.** When the defect touches the UI (what the person sees or does, copy, layout, states, focus, motion), the lead first consults the designer and cites its answer (TL-P4-18 addendum 2). The lead reads the note and rules on one option, with its entries and starting models. The ruling goes in the note under `## Ruling` and as a line in `DECISIONS.md`. **Never a second way to do the same thing:** a fix extends or consolidates the owner mechanism. A new mechanism must remove the copies it replaces, or name the entry that will.
4. **Implement.** The coordinator writes the packets from the ruling. The packet cites the note and the mechanism-map entries it touches. The red reproduces the live evidence, and the class test is part of the verify.
5. **Review.** Besides the acceptance contract, the reviewer answers one fixed question: *does this add a second way to do something that already exists?* A yes blocks.
6. **Close and learn.** The log line gets `status: fixed <sha>`.
   - At the end of each stage or slice, the lead reads every defect from that period together.
   - A class seen twice becomes a base-improvement entry.
   - A rule that keeps being broken by hand becomes a machine check (METHOD, "Rules machines check").

## The exception: trivial fixes

A one-line change inside the owner mechanism, with an obvious cause (a typo, a wrong constant, a missing await), skips steps 2 and 3. The coordinator still logs it and messages the lead, "trivial: <id>, <file:line>, <fix>", and waits for "ok". Anything that adds a branch, a flag, a cache, a retry or a special case is not trivial.

## Who does what

- **Coordinator:** logs the defect, dispatches the diagnoser and implements from the lead's ruling. It never chooses a fix design.
- **Diagnoser:** finds the cause and the options. It never edits code.
- **Lead:** rules on the design, keeps the mechanism map, and reviews patterns at each stage end.
- **Worker:** implements the ruling. Anything outside it goes under "left out", never into the change.
