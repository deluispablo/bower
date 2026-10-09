# Technical-lead decision TL-P4-18: the designer role

**Owner request, 2026-10-09.** The owner wants to fix small UI issues they see, working with a designer, and wants the designer's results to reach the lead, who has them built. The role is to be recorded so that it can be replicated, and built to the highest standard available.

## The role

- **Who.** A Claude Code session named `Diseñador`, opened by the owner, which starts with `/bower-design`. Its brief is [harness/briefs/designer.md](../../harness/briefs/designer.md), and its skill is `.agents/skills/bower-design`.
- **Its own checker.** The subagent `bower-design-checker` (Opus, read-only) tries to disprove each finding before the owner sees it as final, since one rater's view is biased ([NN/g, severity ratings](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/)).
- **Talks to the owner directly.** This is an exception to "only the lead talks to the owner" (TL-P3-17), because taste is the owner's call. The designer speaks Spanish to the owner and English in the repository.
- **Never edits app code. Never messages the coordinator.** Its output is a spec on branch `claude/design` (worktree `/private/tmp/bower-design`) under `docs/design/reviews/`, plus one message to the lead.

## The flow (owner addendum, 2026-10-09: discover first; the lead is contacted only after the owner's OK)

1. **Discover.** Before designing anything, the designer:
   - reads the owner's design artifacts on claude.ai (titles starting with "Bower");
   - reads the design system in the repository: tokens, components, the UI spec, PRODUCT and the copy rules;
   - uses the real app on phone and desktop, in both themes.

   It measures what it sees (WCAG 2.2 AA, axe, keyboard, states), backs every finding with evidence and an NN/g severity, and has `bower-design-checker` challenge the findings.
2. **Show the owner, then wait.** The designer writes a current-state review: what matches, errors, improvements and questions. It gives the owner the top three, then asks. Nothing is designed until the owner says what to work on.
3. **Design until OK.** The designer designs only the agreed items, from the existing tokens and components, and shows before and after (a mockup Artifact or screenshots). Anything new needs a reason and the owner's yes.
4. **Spec to the lead, only after the owner's OK.** The spec has one block per fix, in the shape the lead plans with:
   - a proposed entry id;
   - where;
   - now (the red);
   - change (every state, breakpoints, motion);
   - exact copy;
   - accept when (the verify);
   - the owning mechanism;
   - out of scope;
   - severity and the owner's OK.

   The designer commits it on `claude/design` and sends one message of 10 lines at most to the lead.
5. **Lead.** The lead merges the spec into `main` and rules on how and when each fix is built: entries in the stage plan, packets, and the coordinator. It records each ruling as a TL-P4-18 addendum. It asks the designer technical questions, and the designer takes questions of taste to the owner.
6. **Build and verify.** The coordinator implements under the usual rules. When a fix is on staging or `main`, the lead tells the designer. The designer checks it against the spec, writes `verified` or `not as specified`, and tells the owner and the lead. A "not as specified" result is a defect (TL-P4-15).

The designer keeps `docs/design/STATE.md` in its worktree (TL-P2-43) and never messages the coordinator.

**Timing.** Feature work is paused during the consolidation (TL-P4-14). Design review can start now. Agreed fixes are built in stage 4, which already covers the screen layer (focus return, run view, copy), or right after it. Before then, only a severity-4 fix (a catastrophe) jumps the queue, and only by the lead's ruling.

## Why this design (sources)

- **The running app first, then the code; phases; Blocker to Nit severities; "problems over prescriptions":** the [OneRedOak design-review workflow](https://github.com/OneRedOak/claude-code-workflows/tree/main/design-review).
- **Checks of WCAG 2.2 AA that are often missed:**
  - [target size 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), 24×24;
  - [focus not obscured 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html);
  - [reflow 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), at 320 px.
- **Reduced motion is Level AAA** ([2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)), so here it is a house rule, not an AA failure.
- **axe's `target-size` rule is off by default** ([rule list](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)). An axe pass is never proof by itself.
- **Touch targets:** 44×44 pt for the phone's primary actions ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/buttons)).
- **The four questions of a [cognitive walkthrough](https://www.nngroup.com/articles/cognitive-walkthroughs/).**
- **Observation → impact → request:** [the feedback equation](https://larahogan.me/blog/feedback-equation/).
- **Every finding with evidence, not a claim:** [Claude Code best practices](https://code.claude.com/docs/en/best-practices).
- **The handoff contents (every state, edge cases, motion, accessibility, the reason for each choice):** Anthropic's design-handoff skill (anthropics/knowledge-work-plugins).
- **Why not the `frontend-design` skill.** It is built for new, distinctive surfaces and has no audit method, no evidence rule and no notion of an existing system. Its push toward boldness works against an established brand ([source](https://github.com/anthropics/skills/tree/main/skills/frontend-design)). The designer keeps its list of AI default looks as a "never" list, and loads it only for a new surface the owner asks for.
- **Why not the installed `design:accessibility-review` plugin.** It targets WCAG 2.1 and uses the AAA 44 px target as the bar.
