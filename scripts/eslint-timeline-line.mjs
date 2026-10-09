// One home for a Timeline line (ARCHITECTURE, mechanism map; c3-note-sections): only src/data/contracts/timeline-line.ts
// spells the pattern that reads one or the template that writes one. A syntax rule has one home, ESLint (TL-P4-17
// addendum 4), joined with the other syntax rules in scripts/eslint-syntax.mjs; its test (src/data/one-timeline-line.test.ts)
// feeds the configs sample source.
//
// The reader is found by what it must contain, the separator between a line's date and its text: any regex literal
// that reads a bullet and has ` · ` after it (`^- … · …`). The writer is found by the template quasi that joins the source link, ` · [[`.
import { NOT_PRODUCTION } from './eslint-reservation.mjs';

const reason = 'Read or write a Timeline line through src/data/contracts/timeline-line.ts (parseTimelineLine, timelineLine).';
const rule = (selector, what) => ({ selector, message: `${what}: ${reason}` });

export const SELECTORS = [
  rule('Literal[regex.pattern=/^\\^- .* · /]', 'spells the Timeline-line pattern'),
  rule('TemplateElement[value.cooked=/ · \\[\\[/]', 'writes a Timeline line'),
];

/** Who may spell it, per package (paths from that package's own root): the home alone. */
export const ALLOWED = { root: ['src/data/contracts/timeline-line.ts'], api: [], runner: [] };

/** The flat-config block for one package: the rule everywhere except the home. */
export const timelineLineConfig = (pkg) => ({
  files: ['**/*.{ts,tsx}'],
  ignores: [...NOT_PRODUCTION, ...ALLOWED[pkg]],
  rules: { 'no-restricted-syntax': ['error', ...SELECTORS] },
});
