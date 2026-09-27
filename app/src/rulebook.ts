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

/** Drops leading, trailing and doubled blank lines; keeps the rest as is. */
function tidyBlanks(lines: readonly string[]): string[] {
  const kept: string[] = [];
  for (const line of lines) {
    if (isBlank(line) && (kept.length === 0 || isBlank(kept.at(-1) ?? ''))) {
      continue;
    }
    kept.push(line);
  }
  while (kept.length > 0 && isBlank(kept.at(-1) ?? '')) kept.pop();
  return kept;
}

interface Section {
  /** The heading line as written (`## Tags`, `### Recipes`). */
  heading: string;
  level: 2 | 3;
  /** Everything up to the next `##`/`###` heading. */
  lines: string[];
}

const SUBSECTION_HEADING = /^(#{2,3}) \S/;

/**
 * `text` cut at every `##` and `###` heading outside a code fence, `\r`
 * dropped. What comes before the first one (frontmatter, title, intro) is
 * not a section and is left out.
 */
function sectionsOf(text: string): Section[] {
  const sections: Section[] = [];
  let inFence = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const match = inFence ? null : SUBSECTION_HEADING.exec(line);
    if (FENCE.test(line)) inFence = !inFence;
    if (match !== null) {
      sections.push({
        heading: line,
        level: match[1] === '##' ? 2 : 3,
        lines: [],
      });
    } else {
      sections.at(-1)?.lines.push(line);
    }
  }
  return sections;
}

/** What an old rulebook holds that is the owner's, not Bower's. */
export interface LegacyRules {
  /** The owner's lines from its `## Rules` section. */
  userRules: string[];
  /**
   * The owner's additions anywhere else, in document order: every section
   * Bower's rulebook has no heading for, whole; and, for a section it does
   * have (`## Tags`, say), that section's heading followed by the lines it
   * lacks. Chunks are separated by one blank line.
   */
  migrated: string[];
}

/**
 * Splits an old rulebook (#197) into what is Bower's and what the owner
 * added. A line is Bower's when the template (`templateText`) has it, or
 * an earlier version of the template had it (`retiredLines`), compared
 * with trailing whitespace ignored; everything else is the owner's, kept
 * as written:
 *
 * - `userRules`: the lines of the `## Rules` section (up to the next `## `
 *   heading) that are not Bower's, with leading, trailing and doubled
 *   blank lines dropped.
 * - `migrated`: see `LegacyRules`. Frontmatter, title and intro (before the
 *   first `##`) are Bower's.
 *
 * A rulebook already at version 2 or later has neither by construction (its
 * owner's rules live in `Rules.md`), and the `## Rules` part is empty for
 * one with no such section.
 */
export function splitLegacyRules(
  oldText: string,
  templateText: string,
  retiredLines: readonly string[] = [],
): LegacyRules {
  if (rulesVersionOf(oldText) > LEGACY_RULES_VERSION) {
    return { userRules: [], migrated: [] };
  }

  const own = new Set(
    [...templateText.split('\n'), ...retiredLines]
      .map((line) => line.replace(/\r$/, '').trimEnd())
      .filter((line) => line !== ''),
  );
  const isOwn = (line: string): boolean => own.has(line.trimEnd());

  const rules = rulesSectionLines(oldText) ?? [];
  const userRules = tidyBlanks(rules.filter((line) => !isOwn(line)));

  const chunks: string[][] = [];
  let inRules = false;
  for (const section of sectionsOf(oldText)) {
    if (section.level === 2) inRules = RULES_HEADING.test(section.heading);
    if (inRules) continue;
    if (!isOwn(section.heading)) {
      chunks.push(tidyBlanks([section.heading, ...section.lines]));
      continue;
    }
    const added = section.lines.filter(
      (line) => !isBlank(line) && !isOwn(line),
    );
    if (added.length > 0) chunks.push([section.heading, ...added]);
  }
  const migrated = chunks.flatMap((chunk, i) =>
    i === 0 ? chunk : ['', ...chunk],
  );

  return { userRules, migrated };
}

/**
 * The block `Rules.md` gets from an old rulebook: the owner's `## Rules`
 * lines, then, when there is anything, a `## Migrated from your old
 * rulebook (vN)` heading and the rest of their additions, all byte for
 * byte. Empty when there is nothing to move.
 */
export function migrationBlock(
  legacy: LegacyRules,
  fromVersion: number,
): string[] {
  if (legacy.migrated.length === 0) return legacy.userRules;
  const heading = [
    `## Migrated from your old rulebook (v${fromVersion})`,
    '',
    ...legacy.migrated,
  ];
  return legacy.userRules.length === 0
    ? heading
    : [...legacy.userRules, '', ...heading];
}

/**
 * `rulesText` with `userRules` (a `migrationBlock`) appended as one block,
 * byte for byte, after exactly one blank line. Unchanged when there is nothing to add or the
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
