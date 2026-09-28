/**
 * `Rules.md` in a shape the app can read (#341, handover D.3): one `## `
 * heading per topic, one rule per bullet, each with where it came from and
 * its date, and a paused rule struck through (the agent ignores those):
 *
 * ```markdown
 * ## Finance
 * - Receipts go to Finance, named by shop and date (owner's request, 2026-09-26)
 * - ~~Never archive Finance~~ (paused 2026-09-27)
 * ```
 *
 * Any `## ` section already in the file is a topic too (`## From the
 * interview`, `## From Bower's suggestions`, a migrated old rulebook), so a
 * file written before this shape needs no migration; bullets before the
 * first `## ` heading are the "Everything else" group. A rule is a
 * top-level bullet outside a fenced code block; every other line (the
 * frontmatter, the title, prose, indented lines) is kept byte for byte and
 * never counted. Write-backs (`applyRuleEdit`) only ever rewrite or remove
 * the rule's own line. Pure: no Drive, no clock — `vault-store.tsx`'s
 * `runRuleEdit` does the writing.
 */

/** Past this many lines the lint check flags `Rules.md` (#295). */
export const RULES_LINE_CAP = 200;

/** The topic for bullets written before the first `## ` heading. */
export const UNGROUPED_TOPIC = 'Everything else';

/** Where a rule written by the owner says it came from. */
export const OWNER_ORIGIN = "owner's request";

export interface Rule {
  /** Index of the rule's line in the file (`\r` not counted as a line). */
  line: number;
  /** The line exactly as written, `\r` dropped: what a write-back checks
   * it is still changing the same rule. */
  raw: string;
  /** The bullet marker and the space after it, as written, e.g. `- `. */
  marker: string;
  /** The rule's text: no marker, no strike-through, no date tail. */
  text: string;
  /** Struck through: the agent ignores it. */
  paused: boolean;
  /** `YYYY-MM-DD` from the tail: when it was asked for, or paused. */
  date: string | null;
  /** Who asked for it (`owner's request`, `accepted suggestion`), from the
   * tail; `null` for a paused rule's `(paused …)` tail or no tail. */
  origin: string | null;
  /** What the parentheses at the end hold, as written, when they end in a
   * date; `null` otherwise. */
  tail: string | null;
}

export interface RuleGroup {
  /** The heading's text without `## `, or `UNGROUPED_TOPIC`. */
  topic: string;
  /** Its rules in file order; same-named sections are one group. */
  rules: Rule[];
  /** How many rules, paused ones included. */
  count: number;
  /** How many of them are paused. */
  paused: number;
}

export interface ParsedRules {
  /** Topics in order of first appearance; a heading with no rules is left
   * out. */
  groups: RuleGroup[];
  /** Every line of the file, `\r` dropped, for `serialiseRules`. */
  lines: string[];
  /** `\r\n` when the file was written with it, else `\n`. */
  eol: string;
  /** Lines in the file, the empty one after a final newline not counted. */
  lineCount: number;
  /** Over `RULES_LINE_CAP`. */
  overCap: boolean;
}

/** Which rule a write-back is for: its line and text when it was read. */
export interface RuleRef {
  line: number;
  raw: string;
}

export type RuleEdit =
  | { kind: 'change'; rule: RuleRef; text: string }
  | { kind: 'pause'; rule: RuleRef }
  | { kind: 'resume'; rule: RuleRef }
  | { kind: 'remove'; rule: RuleRef };

/** Thrown by `applyRuleEdit` for a rule it cannot change. */
export class RuleError extends Error {
  readonly code: 'missing' | 'empty';

  constructor(code: 'missing' | 'empty', message: string) {
    super(message);
    this.name = 'RuleError';
    this.code = code;
  }
}

const HEADING = /^## +(.+?)\s*$/;
const FENCE = /^\s*(```|~~~)/;
/** A top-level bullet: `-`, `*` or `+` at the start of the line, then a
 * space. An indented one belongs to the bullet above it. */
const BULLET = /^([-*+][ \t]+)(.*)$/;
/** Parentheses at the end whose content ends in a date. */
const TAIL = /^(.*?)\s*\(([^()]*?(\d{4}-\d{2}-\d{2}))\)\s*$/;
const STRUCK = /^~~(.+)~~$/;
const PAUSED_TAIL = /^paused\s+\d{4}-\d{2}-\d{2}$/i;
const ORIGIN_TAIL = /^(.+?),\s*\d{4}-\d{2}-\d{2}$/;

function eolOf(md: string): string {
  return md.includes('\r\n') ? '\r\n' : '\n';
}

function linesOf(md: string): string[] {
  return md.split('\n').map((line) => line.replace(/\r$/, ''));
}

/** Where the body starts: after a leading `---` frontmatter block, if any. */
function bodyStart(lines: readonly string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') return i + 1;
  }
  return 0;
}

/** `line` as a rule, or `null` when it is not a top-level bullet with
 * text. */
function ruleOf(line: string, index: number): Rule | null {
  const bullet = BULLET.exec(line);
  if (bullet === null) return null;
  const marker = bullet[1] ?? '- ';
  let body = (bullet[2] ?? '').trim();
  if (body === '') return null;

  let tail: string | null = null;
  let date: string | null = null;
  let origin: string | null = null;
  const t = TAIL.exec(body);
  if (t !== null && (t[1] ?? '').trim() !== '') {
    body = (t[1] ?? '').trim();
    tail = (t[2] ?? '').trim();
    date = t[3] ?? null;
    if (!PAUSED_TAIL.test(tail)) {
      origin = ORIGIN_TAIL.exec(tail)?.[1]?.trim() ?? null;
    }
  }

  const struck = STRUCK.exec(body);
  const paused = struck !== null;
  const text = (struck?.[1] ?? body).trim();
  if (text === '') return null;
  return { line: index, raw: line, marker, text, paused, date, origin, tail };
}

/** Counts lines the way an editor shows them: a final newline does not
 * start another one. */
function countLines(lines: readonly string[]): number {
  return lines.length > 0 && lines.at(-1) === ''
    ? lines.length - 1
    : lines.length;
}

/**
 * `md` (the whole of `Rules.md`) read into topic groups, each with its
 * count of rules and of paused ones, plus the line count against
 * `RULES_LINE_CAP`. Never throws: a file with no rules has no groups.
 */
export function parseRules(md: string): ParsedRules {
  const lines = linesOf(md);
  const groups: RuleGroup[] = [];
  const byTopic = new Map<string, RuleGroup>();
  let topic = UNGROUPED_TOPIC;
  let fenced = false;

  for (let i = bodyStart(lines); i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = HEADING.exec(line);
    if (heading !== null) {
      topic = heading[1] ?? UNGROUPED_TOPIC;
      continue;
    }
    const rule = ruleOf(line, i);
    if (rule === null) continue;
    const key = topic.toLowerCase();
    let group = byTopic.get(key);
    if (group === undefined) {
      group = { topic, rules: [], count: 0, paused: 0 };
      byTopic.set(key, group);
      groups.push(group);
    }
    group.rules.push(rule);
    group.count += 1;
    if (rule.paused) group.paused += 1;
  }

  const lineCount = countLines(lines);
  return {
    groups,
    lines,
    eol: eolOf(md),
    lineCount,
    overCap: lineCount > RULES_LINE_CAP,
  };
}

/** Every rule in the file, in file order. */
export function allRules(parsed: ParsedRules): Rule[] {
  return parsed.groups
    .flatMap((group) => group.rules)
    .sort((a, b) => a.line - b.line);
}

/** `rule` written back as one line: its marker, its text (struck through
 * when paused) and its tail. */
export function formatRule(
  rule: Pick<Rule, 'marker' | 'text' | 'paused' | 'tail'>,
): string {
  const text = rule.paused ? `~~${rule.text}~~` : rule.text;
  return `${rule.marker}${text}${rule.tail === null ? '' : ` (${rule.tail})`}`;
}

/** The bullet the interview, Accept and a change write: `- <text>
 * (owner's request, <on>)`. */
export function ruleBullet(text: string, on: string): string {
  return formatRule({
    marker: '- ',
    text: oneLine(text),
    paused: false,
    tail: `${OWNER_ORIGIN}, ${on}`,
  });
}

/**
 * `parsed` written back: every rule's line from its fields
 * (`formatRule`), every other line as it was, the file's own line ending.
 * `serialiseRules(parseRules(md))` gives `md` back for any file in the
 * shape, and for the legacy sections.
 */
export function serialiseRules(parsed: ParsedRules): string {
  const lines = [...parsed.lines];
  for (const rule of allRules(parsed)) lines[rule.line] = formatRule(rule);
  return lines.join(parsed.eol);
}

/** Whitespace, newlines included, collapsed: a rule is one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The rule `ref` names in `parsed`: at its line when that line is still
 * what was read, else the one line anywhere with the same text. */
function locate(parsed: ParsedRules, ref: RuleRef): Rule {
  const rules = allRules(parsed);
  const atLine = rules.find((r) => r.line === ref.line && r.raw === ref.raw);
  if (atLine !== undefined) return atLine;
  const same = rules.filter((r) => r.raw === ref.raw);
  if (same.length === 1 && same[0] !== undefined) return same[0];
  throw new RuleError('missing', 'That rule is no longer there.');
}

/**
 * `md` with one rule changed, paused, resumed or removed, dated `on`
 * (`YYYY-MM-DD`): only that rule's own line is rewritten (or, for remove,
 * dropped); every other byte stays. Pausing a paused rule or resuming an
 * active one returns `md` unchanged, so a retry after a failed write is
 * safe. `RuleError('missing')` when the rule is not in `md` any more (the
 * file changed underneath), `RuleError('empty')` for a change to no text.
 */
export function applyRuleEdit(md: string, edit: RuleEdit, on: string): string {
  const parsed = parseRules(md);
  const rule = locate(parsed, edit.rule);
  const lines = [...parsed.lines];

  switch (edit.kind) {
    case 'remove':
      lines.splice(rule.line, 1);
      return lines.join(parsed.eol);
    case 'pause':
      if (rule.paused) return md;
      lines[rule.line] = formatRule({
        ...rule,
        paused: true,
        tail: `paused ${on}`,
      });
      break;
    case 'resume':
      if (!rule.paused) return md;
      lines[rule.line] = formatRule({
        ...rule,
        paused: false,
        tail: `${OWNER_ORIGIN}, ${on}`,
      });
      break;
    case 'change': {
      const text = oneLine(edit.text);
      if (text === '') {
        throw new RuleError('empty', 'A rule needs some words.');
      }
      if (text === rule.text) return md;
      lines[rule.line] = formatRule({
        ...rule,
        text,
        tail: rule.paused
          ? `paused ${rule.date ?? on}`
          : `${OWNER_ORIGIN}, ${on}`,
      });
      break;
    }
  }
  return lines.join(parsed.eol);
}
