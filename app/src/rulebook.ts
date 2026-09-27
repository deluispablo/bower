/**
 * Bower's rulebook (`CLAUDE.md`) and the owner's rules (`Rules.md`), #197.
 * Three files, three owners: `CLAUDE.md` is Bower's and carries
 * `bower_rules_version` in its frontmatter; `Rules.md` and `About-Me.md`
 * are the owner's. Pure: no Drive, no cache, unit-tested directly.
 * `vault-store.tsx` does the reads and writes.
 */

import { parseFrontmatter } from './markdown/frontmatter.js';

/** The rulebook from before the split (no `bower_rules_version` field). */
export const LEGACY_RULES_VERSION = 1;

/**
 * The `bower_rules_version` in a rulebook's frontmatter: a whole number of
 * at least 1. No frontmatter, no field or anything else in it reads as
 * `LEGACY_RULES_VERSION`, the rulebook from before the split.
 */
export function rulesVersionOf(text: string): number {
  const value = parseFrontmatter(text).data.bower_rules_version;
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\s*\d+\s*$/.test(value)
        ? Number(value)
        : NaN;
  return Number.isInteger(n) && n >= LEGACY_RULES_VERSION
    ? n
    : LEGACY_RULES_VERSION;
}

/** Whether a vault's rulebook is older than the one compiled into the app. */
export function isRulebookBehind(
  vaultVersion: number,
  templateVersion: number,
): boolean {
  return vaultVersion < templateVersion;
}

const RULES_HEADING = /^## Rules[ \t]*$/;
const SECTION_HEADING = /^## /;
const FENCE = /^(```|~~~)/;

/**
 * The lines of `text`'s `## Rules` section: everything after the heading up
 * to the next `## ` heading (or the end), `\r` dropped. `null` when there is
 * no such heading. Headings inside a fenced code block do not count.
 */
export function rulesSectionLines(text: string): string[] | null {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  let inFence = false;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (start < 0) {
      if (RULES_HEADING.test(line)) start = i + 1;
    } else if (SECTION_HEADING.test(line)) {
      return lines.slice(start, i);
    }
  }
  return start < 0 ? null : lines.slice(start);
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/**
 * The owner's own lines in an old rulebook's `## Rules` section: every line
 * there that is not one of the template's own (compared with trailing
 * whitespace ignored), kept as written, with leading, trailing and doubled
 * blank lines dropped. A rulebook already at version 2 or later has none by
 * construction (its owner's rules live in `Rules.md`), and neither has one
 * with no `## Rules` section.
 */
export function splitLegacyRules(
  oldText: string,
  templateText: string,
): { userRules: string[] } {
  if (rulesVersionOf(oldText) > LEGACY_RULES_VERSION) return { userRules: [] };
  const old = rulesSectionLines(oldText);
  if (old === null) return { userRules: [] };

  const own = new Set(
    (rulesSectionLines(templateText) ?? [])
      .filter((line) => !isBlank(line))
      .map((line) => line.trimEnd()),
  );

  const kept: string[] = [];
  for (const line of old) {
    if (own.has(line.trimEnd())) continue;
    if (isBlank(line) && (kept.length === 0 || isBlank(kept.at(-1) ?? ''))) {
      continue;
    }
    kept.push(line);
  }
  while (kept.length > 0 && isBlank(kept.at(-1) ?? '')) kept.pop();
  return { userRules: kept };
}

/**
 * `rulesText` with `userRules` appended as one block, byte for byte, after
 * exactly one blank line. Unchanged when there is nothing to add or the
 * block is already there, so running an interrupted update again never
 * adds the same lines twice.
 */
export function rulesWithUserLines(
  rulesText: string,
  userRules: readonly string[],
): string {
  if (userRules.length === 0) return rulesText;
  const block = userRules.join('\n');
  if (rulesText.replace(/\r\n/g, '\n').includes(block)) return rulesText;
  const body = rulesText.replace(/(\r?\n)+$/, '');
  return body === '' ? `${block}\n` : `${body}\n\n${block}\n`;
}

/** How many of `userRules` are actual lines, not blank separators. */
export function countRuleLines(userRules: readonly string[]): number {
  return userRules.filter((line) => !isBlank(line)).length;
}
