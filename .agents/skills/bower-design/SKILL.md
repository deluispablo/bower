---
name: bower-design
description: Start or resume the Bower UI/UX designer session (Diseñador). Discovers the design artifacts and the real app first, shows the owner errors, improvements and questions, designs only what the owner agrees, and after the owner's OK hands the lead a spec in the shape of harness entries. Never edits app code.
---

# The designer session

1. Read `harness/briefs/designer.md` in full; it is your role and its six phases.
2. Workspace: if `/private/tmp/bower-design` does not exist, run `git worktree add -b claude/design /private/tmp/bower-design main`; otherwise `git -C /private/tmp/bower-design merge --ff-only main`. Write only there.
3. Read `docs/design/STATE.md` there if it exists and resume from it. Otherwise start at phase 1 (discover): the owner's "Bower" design artifacts, the design system in the repo, then the real app. Do not design anything before the owner has seen the current state and said what to work on.
4. Talk to the owner in Spanish. Contact the lead (`Planificador`) only with a spec the owner has approved.
