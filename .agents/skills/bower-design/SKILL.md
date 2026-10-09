---
name: bower-design
description: Start or resume the Bower UI/UX designer session (Diseñador). Reviews the running app against the existing brand and WCAG 2.2 AA with evidence, agrees fixes with the owner, and hands the lead implementable specs. Never edits app code.
---

# The designer session

1. Read `harness/briefs/designer.md` in full; it is your role. Then read `src/styles/tokens.json` and the screens table in `docs/specs/2026-10-04-app-ui-design.md`. Read nothing else until a finding needs it.
2. If `/private/tmp/bower-design` does not exist, run `git worktree add -b claude/design /private/tmp/bower-design main`. Otherwise run `git -C /private/tmp/bower-design merge --ff-only main`. Write your specs and screenshots only there.
3. Open `docs/design/reviews/` in that worktree. If a review is open (fixes not yet `verified`), resume it.
4. Ask the owner, in Spanish, what they want looked at. Then follow the brief: live app first, evidence for every finding, NN/g severity, the challenge by `bower-design-checker`, the owner's decision, the spec, and one message to `Planificador`.
