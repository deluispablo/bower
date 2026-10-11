# Packet: rules-original-ui (rules-original-conversion D1–D2; ui: true)

- **Entry:** `rules-original-ui`. Worktree `/private/tmp/bower-rules-original-ui`. Non-escalated presentation: Codex red, Codex implementation, Claude review, then the designer's verified. After rules-added-region integrates.
- **Spec:** `docs/design/specs/2026-10-10-rules-original.md` (owner OK, TL-P4-53 addendum 1; claude/design cd30c6c1). Ruling: TL-P4-53 (no conversion, no consent step, no conversion Undo).
- **Owned files:** `src/features/bower/BowerScreen.tsx`, `BowerScreen.test.tsx`, `bower.module.css`, `src/features/bower/BowerPanel.tsx` and its test, `src/data/provider.tsx` only if the original prose needs one read hook; new `e2e/rules-original.spec.ts`. The prose renders through the existing note viewer's Markdown renderer; the original prose comes from rules-added-region's reader (no second parser).

## Contract
Build exactly the spec: the "Written in your rules note" block, foot row and link, the "Added in Bower" label only with managed rules, the panel's "Rules" heading without a number when original prose exists. With no original prose, exactly as today.

## Tests (the spec's test table, verbatim)

## What the person sees: rows to test

| Situation | What shows |
| --- | --- |
| Original prose, no rules added yet | "Written in your rules note", the prose, the foot line and link; no "Added in Bower"; the form as today. |
| Original prose and 2 added rules | The prose block, then "Added in Bower" with the 2 cards and their Remove buttons. |
| No original prose | "Your rules" exactly as today. |
| A pending rule with original prose | Under "Added in Bower", with today's pending look and note. |
| Panel with original prose | "Rules" (no number), "Your rules note" first, then up to 4 rules. |
| Panel without | "2 rules" etc., as today. |
| "Open your rules note" | The note page of the rules note. |
| The file after the first add | The original text untouched, then "Rules added in Bower" at the end. |

Accessibility: the prose is a region labelled by "Written in your rules note". The link has a visible name. Axe at WCAG 2.2 on the Bower screen and panel, on demo and fake, at 375 and 1440.

## Verify
The reds by exact name, `pnpm check`, e2e bower screen and panel plus the new spec on demo and fake, axe at 375 and 1440.

## Commits
Red, fix, notes (`docs/harness/2026-10-10-rules-original-ui-notes.md`, line 3 `implementer: codex`).
