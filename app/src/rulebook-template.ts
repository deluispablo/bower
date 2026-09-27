/**
 * The rulebook and `Rules.md` a new Bower folder starts with, compiled into
 * the app at build time (#197): Vite inlines `vault-template/` through
 * `?raw`, and the version is read from the rulebook's own frontmatter, so
 * there is one source of truth. Imported lazily (`import()`) by Settings
 * and the update action only, so the text stays out of the startup bundle.
 */

import rulebook from '../../vault-template/CLAUDE.md?raw';
import rules from '../../vault-template/Rules.md?raw';

import { rulesVersionOf } from './rulebook.js';

/** Line endings as the Worker writes them (`api/scripts/bundle-template.mjs`). */
function lf(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** `vault-template/CLAUDE.md`, exactly as a new Bower folder gets it. */
export const TEMPLATE_RULEBOOK: string = lf(rulebook);

/** `vault-template/Rules.md`, for a folder from before `Rules.md` existed. */
export const TEMPLATE_RULES: string = lf(rules);

/** The template rulebook's `bower_rules_version`. */
export const TEMPLATE_RULES_VERSION: number = rulesVersionOf(TEMPLATE_RULEBOOK);
