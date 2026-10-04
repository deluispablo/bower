# CLAUDE.md

Guide for AI sessions in the Bower app rebuild. Short on purpose.

- Spec: `docs/specs/`. Phase 1 = UI on demo data. Screens only talk to `src/data/sources.ts`; never import the demo from a screen.
- Brand: `src/styles/tokens.json` (from the Bower design system). Run `pnpm tokens` after changing it. Teal and amber are fills; use `--brand-line`/`--accent-line` for text.
- Bower (the bird): one animated per screen (`bird/presence.ts`); CSS poses for loops, `BirdEngine` for travel. Respect "Bower moves" and reduced motion.
- No personal data, ever: `Alex`, `you@example.com`. No secrets.
- Copy: English, sentence case, no jargon, never "vault". Bower is a bowerbird, never "the bird" in copy.
- TypeScript strict, no `any`. Pure logic gets Vitest tests; flows get Playwright tests.
- `pnpm check` and `pnpm e2e` green before a commit. Local only: never push.
