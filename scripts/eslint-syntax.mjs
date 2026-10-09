// The syntax rules every package's ESLint config runs (TL-P4-17 addendum 4), joined into one `no-restricted-syntax`.
// ESLint keeps only the last options a file gets for a rule (flat config, "Configuration objects": a later object's
// rule options replace an earlier one's), so two blocks of the same rule would silence each other. Each rule keeps its
// own selectors and allowlist; a file one rule allows still gets the others' selectors.
import { questionKeyConfig } from './eslint-question-key.mjs';
import { reservationConfig } from './eslint-reservation.mjs';
import { timelineLineConfig } from './eslint-timeline-line.mjs';

const selectorsOf = (block) => block.rules['no-restricted-syntax'].slice(1);
const rulesOf = (blocks) => ({ 'no-restricted-syntax': ['error', ...blocks.flatMap(selectorsOf)] });

/** The flat-config blocks for one package: every rule outside every allowlist, then each allowed file with the rest. */
export function syntaxConfig(pkg) {
  const blocks = [reservationConfig(pkg), questionKeyConfig(pkg), timelineLineConfig(pkg)];
  const ignored = [...new Set(blocks.flatMap((b) => b.ignores))];
  const byAll = ignored.filter((p) => blocks.every((b) => b.ignores.includes(p)));
  return [
    { files: ['**/*.{ts,tsx}'], ignores: ignored, rules: rulesOf(blocks) },
    ...ignored.filter((p) => !byAll.includes(p)).map((p) => ({ files: [p], ignores: byAll, rules: rulesOf(blocks.filter((b) => !b.ignores.includes(p))) })),
  ];
}
