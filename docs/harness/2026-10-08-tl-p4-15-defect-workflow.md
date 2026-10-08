# Technical-lead decision TL-P4-15: a professional defect workflow

**Owner decision, 2026-10-08.** The coordinator must no longer decide alone how to fix a problem. Fixes made without knowledge of the rest of the code produced spaghetti, and the review behind TL-P4-14 shows it: the same idea implemented several times. Every error is a chance to revisit the code and improve it. The owner approved the workflow below and asked that it be recorded so that it can be replicated.

**Sources.** The workflow is the usual practice of a professional team:
- **Blameless root-cause analysis** with the "5 whys" ([Google SRE, postmortem culture](https://sre.google/sre-book/postmortem-culture/)).
- **A design decision recorded before the code** ([ADR, Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)).
- **Preparatory refactoring** ([Fowler](https://martinfowler.com/articles/preparatory-refactoring-example.html)).
- **Clear ownership of each mechanism.**
- **Machine checks for duplication and boundaries:**
  - [jscpd](https://github.com/kucherenko/jscpd), a copy-paste detector;
  - [dependency-cruiser](https://github.com/sverweij/dependency-cruiser), dependency rules.

**Ruling.**
1. [DEFECTS.md](DEFECTS.md) is the procedure:
   - log the defect, don't fix it;
   - diagnose it (`bower-diagnoser`, Opus, read-only);
   - the lead rules on the design;
   - implement from the ruling;
   - review with the fixed question "does this add a second way to do something that exists?";
   - close it, and review patterns at each stage end.

   [DEFECT_LOG.md](DEFECT_LOG.md) holds one line per defect, and `defects/` one note per diagnosis.
2. **The mechanism map** in [ARCHITECTURE.md](../ARCHITECTURE.md#mechanism-map) gives each mechanism one home. Packets cite the entries they touch, so a worker knows the rest of the system without reading it.
3. **The coordinator never chooses a fix design.** A review finding inside an entry's own contract is still fixed in that entry's fix round. A finding that shows the design is wrong, or that touches another mechanism, goes through DEFECTS.md.
4. **Trivial fixes** (one line, inside the owner mechanism, with an obvious cause) skip diagnosis and design, but still need the log line and the lead's "ok".
5. **Machine checks, added to stage 1 of TL-P4-14:**
   - **`c1-duplication-gate`** (`bower-mechanical`): jscpd in `pnpm check`, with a baseline committed from today's count. The count may only fall, and a new clone fails the check.
   - **`c1-dependency-rules`** (`bower-implementer`): dependency-cruiser in `pnpm check`. Production code (`src/` outside `fake/` and `demo/`, `runner/`, `api/`) never imports from `fake/` or `demo/`. Screens import only `sources`, `provider` and `types`, replacing `src/architecture.test.ts`'s hand-written rule. Imports that break the rule today are listed as known exceptions with the entry that removes each one, and the list may only shrink.
6. **The procedure documents now say this:**
   - METHOD.md;
   - COORDINATION.md;
   - the coordinator's and the lead's briefs;
   - WORKER.md (the review question);
   - the reviewer agent and skill;
   - AGENTS.md;
   - `harness/after-compact.md`.

   Another project can replicate the workflow from DEFECTS.md, the diagnoser agent and the mechanism map.
