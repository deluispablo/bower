// One home for a question's subject and key (ARCHITECTURE, mechanism map "Question subject and identity"; c3-subject):
// only src/data/contracts/questions.ts builds or reads a `q-ask-`/`q-state-` id. A syntax rule has one home, ESLint
// (TL-P4-17 addendum 4), joined with the other syntax rules in scripts/eslint-syntax.mjs; its test (src/data/one-question-key.test.ts) feeds the configs sample source.

// The rule targets the key's construction, not one spelling: the prefix written out anywhere in a string, and a
// question id put together from pieces (a bare `q`/`q-` piece, or a template that starts `q-` and goes on with a
// constant or a literal). Other questions' ids (`q-${rule.id}-…`, `q-adopt-states`) are left alone.
import { NOT_PRODUCTION } from './eslint-reservation.mjs';

const reason = 'Build or read a question id through src/data/contracts/questions.ts (askId, stateQuestionId, subjectOf, subjectKey).';
const rule = (selector, what) => ({ selector, message: `${what}: ${reason}` });

export const SELECTORS = [
  rule('Literal[value=/q-(ask|state)/]', 'spells a question id'),
  rule('TemplateElement[value.cooked=/q-(ask|state)/]', 'spells a question id'),
  rule('Literal[value=/^q-?$/]', 'builds a question id'),
  rule('TemplateLiteral[quasis.0.value.cooked=/^q-?$/][expressions.0.type=/^(Identifier|Literal)$/]', 'builds a question id'),
];

/** Who may build a question id, per package (paths from that package's own root): the home alone. */
export const ALLOWED = { root: ['src/data/contracts/questions.ts'], api: [], runner: [] };

/** The flat-config block for one package: the rule everywhere except the home. */
export const questionKeyConfig = (pkg) => ({
  files: ['**/*.{ts,tsx}'],
  ignores: [...NOT_PRODUCTION, ...ALLOWED[pkg]],
  rules: { 'no-restricted-syntax': ['error', ...SELECTORS] },
});
