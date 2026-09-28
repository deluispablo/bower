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
  /** For a paused rule whose tail remembers when it was said (`said
   * <date>, paused <date>`), the said-on date, so Resume can restore it
   * (#443); `null` when the tail holds no said-on date, paused or not. */
  saidDate: string | null;
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
/** `paused <date>`, or, when the said-on date survives a pause (#443),
 * `said <date>, paused <date>`. */
const PAUSED_TAIL =
  /^(?:said\s+\d{4}-\d{2}-\d{2},\s*)?paused\s+\d{4}-\d{2}-\d{2}$/i;
const SAID_TAIL = /^said\s+(\d{4}-\d{2}-\d{2}),\s*paused\s+\d{4}-\d{2}-\d{2}$/i;
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
  let saidDate: string | null = null;
  const t = TAIL.exec(body);
  if (t !== null && (t[1] ?? '').trim() !== '') {
    body = (t[1] ?? '').trim();
    tail = (t[2] ?? '').trim();
    date = t[3] ?? null;
    if (PAUSED_TAIL.test(tail)) {
      saidDate = SAID_TAIL.exec(tail)?.[1] ?? null;
    } else {
      origin = ORIGIN_TAIL.exec(tail)?.[1]?.trim() ?? null;
    }
  }

  const struck = STRUCK.exec(body);
  const paused = struck !== null;
  const text = (struck?.[1] ?? body).trim();
  if (text === '') return null;
  return {
    line: index,
    raw: line,
    marker,
    text,
    paused,
    date,
    origin,
    saidDate,
    tail,
  };
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

/** "From now on", "Always", "Never", "Every time" at the start of a rule
 * sentence, with the comma or colon after it. */
const RULE_LEAD = /^\s*(?:from now on|always|never|every time)\b[\s,:;.-]*/i;

/** A word of a sentence: letters or digits, with inner `'` or `-`. */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/** Words that are never a topic: the small words and the verbs a rule is
 * made of ("file", "put", "keep", "tag"…). */
const SMALL_WORDS: ReadonlySet<string> = new Set(
  (
    'a an the i me my mine we us our you your it its they them their this ' +
    "that these those all any every each some no not dont don't don’t do " +
    'does did is are be been am was were will would should can could must ' +
    'may might to of in on at by for with from into onto under over out up ' +
    'down about as and or but if when whenever where while then so than too ' +
    'also only just still again ever anything something everything nothing ' +
    'thing things one ones new old file files filed put puts move moves ' +
    'moved go goes keep keeps send sends save saves tag tags tagged name ' +
    'names named rename archive add adds added make makes use uses delete ' +
    'remove sort store mark leave treat ask turn get gets let lets there ' +
    'here what which who how time times now always never'
  ).split(' '),
);

function isSmall(word: string): boolean {
  return SMALL_WORDS.has(word.toLowerCase()) || /^\d+$/.test(word);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Where `topic` (or its plural, or its singular) first appears in
 * `sentence` as whole words; -1 when it does not. */
function topicAt(sentence: string, topic: string): number {
  const base = oneLine(topic).toLowerCase();
  if (base === '') return -1;
  const forms = new Set([base, `${base}s`, base.replace(/s$/, '')]);
  let best = -1;
  for (const form of forms) {
    if (form === '') continue;
    const match = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(form)}(?![\\p{L}\\p{N}])`,
      'iu',
    ).exec(sentence);
    if (match !== null && (best === -1 || match.index < best)) {
      best = match.index;
    }
  }
  return best;
}

/**
 * The topic a rule sentence goes under (#343, handover D.2), `topics` being
 * the ones `Rules.md` already has: the topic the sentence names first
 * (plural or singular, so "receipts" finds "Receipt"); else a new topic
 * from its first noun, a capitalised word first ("…under Finance" →
 * `Finance`), then the first word that is not a small word or a verb
 * ("receipts go…" → `Receipts`); else `UNGROUPED_TOPIC`. The lead ("From
 * now on", "Always", "Never", "Every time") never counts.
 */
export function guessTopic(
  sentence: string,
  topics: readonly string[],
): string {
  const rest = oneLine(sentence).replace(RULE_LEAD, '');
  let named: string | null = null;
  let namedAt = -1;
  for (const topic of topics) {
    if (topic.toLowerCase() === UNGROUPED_TOPIC.toLowerCase()) continue;
    const at = topicAt(rest, topic);
    if (at !== -1 && (namedAt === -1 || at < namedAt)) {
      named = topic;
      namedAt = at;
    }
  }
  if (named !== null) return named;

  const words = (rest.match(WORD) ?? []).filter((word) => !isSmall(word));
  const capitalised = words.find((word) => /^\p{Lu}/u.test(word));
  const noun = capitalised ?? words[0];
  if (noun === undefined) return UNGROUPED_TOPIC;
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
}

/**
 * `md` with `text` appended as a rule under `topic` (#343, a rule kept at
 * once), dated `on`: after the last line of that topic's section, or, for
 * `UNGROUPED_TOPIC` with rules before the first heading, after the last of
 * those; a topic the file does not have gets its `## ` heading at the end.
 * Every other line stays as it was. Returns `md` unchanged when the same
 * rule is already there (a retry adds nothing twice);
 * `RuleError('empty')` for no text.
 */
export function appendRule(
  md: string,
  text: string,
  topic: string,
  on: string,
): string {
  if (oneLine(text) === '') {
    throw new RuleError('empty', 'A rule needs some words.');
  }
  const bullet = ruleBullet(text, on);
  const wanted = allRules(parseRules(bullet))[0]?.text ?? oneLine(text);
  const parsed = parseRules(md);
  if (allRules(parsed).some((rule) => rule.text === wanted)) return md;

  const lines = [...parsed.lines];
  const name = oneLine(topic) || UNGROUPED_TOPIC;
  const key = name.toLowerCase();
  const headings: { line: number; key: string }[] = [];
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
      headings.push({ line: i, key: (heading[1] ?? '').toLowerCase() });
    }
  }

  const own = headings.filter((h) => h.key === key).at(-1);
  if (own !== undefined) {
    const next = headings.find((h) => h.line > own.line)?.line ?? lines.length;
    let at = own.line + 1;
    for (let i = own.line + 1; i < next; i++) {
      if ((lines[i] ?? '').trim() !== '') at = i + 1;
    }
    lines.splice(at, 0, bullet);
    return lines.join(parsed.eol);
  }

  const firstHeading = headings[0]?.line ?? lines.length;
  const lastUngrouped = allRules(parsed)
    .filter((rule) => rule.line < firstHeading)
    .at(-1);
  if (key === UNGROUPED_TOPIC.toLowerCase() && lastUngrouped !== undefined) {
    lines.splice(lastUngrouped.line + 1, 0, bullet);
    return lines.join(parsed.eol);
  }

  while (lines.length > 0 && (lines.at(-1) ?? '').trim() === '') lines.pop();
  if (lines.length > 0) lines.push('');
  lines.push(`## ${name}`, bullet, '');
  return lines.join(parsed.eol);
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
        tail:
          rule.date === null
            ? `paused ${on}`
            : `said ${rule.date}, paused ${on}`,
      });
      break;
    case 'resume':
      if (!rule.paused) return md;
      lines[rule.line] = formatRule({
        ...rule,
        paused: false,
        tail: `${OWNER_ORIGIN}, ${rule.saidDate ?? on}`,
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
          ? rule.saidDate === null
            ? `paused ${rule.date ?? on}`
            : `said ${rule.saidDate}, paused ${rule.date ?? on}`
          : `${OWNER_ORIGIN}, ${on}`,
      });
      break;
    }
  }
  return lines.join(parsed.eol);
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `2026-09-26` as the Rules screen shows it, `26 Sep`; anything else as
 * written. No locale, no clock: the same on every device. */
export function shortDay(day: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  const month = MONTHS[Number(match?.[1] ?? 0) - 1];
  if (match === null || month === undefined) return day;
  return `${String(Number(match[2]))} ${month}`;
}

/** Who asked for a rule, in the screen's words: `You said it` for the
 * owner's own request, the tail as written otherwise. */
function whoSaid(origin: string | null): string | null {
  if (origin === null) return null;
  if (origin.toLowerCase() === OWNER_ORIGIN) return 'You said it';
  return origin.charAt(0).toUpperCase() + origin.slice(1);
}

/**
 * The line under a rule on the Rules screen (#342, board Phone-Bower):
 * `You said it · 26 Sep`; a paused rule, whose chip already says Paused,
 * `Since 27 Sep`. Empty when the rule has no tail to read it from.
 */
export function ruleMeta(
  rule: Pick<Rule, 'paused' | 'date' | 'origin'>,
): string {
  if (rule.paused) {
    return rule.date === null ? '' : `Since ${shortDay(rule.date)}`;
  }
  return [whoSaid(rule.origin), rule.date === null ? null : shortDay(rule.date)]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/**
 * The small heading of a tapped rule's sheet (#342, board
 * Phone-Rule-Menu): its topic, then who asked for it and when,
 * `Finance · you said it on 26 Sep`, or `Finance · paused on 27 Sep`.
 */
export function ruleSheetLabel(
  topic: string,
  rule: Pick<Rule, 'paused' | 'date' | 'origin'>,
): string {
  if (rule.date === null) return topic;
  const on = shortDay(rule.date);
  if (rule.paused) return `${topic} · paused on ${on}`;
  const who = whoSaid(rule.origin);
  return who === null
    ? `${topic} · ${on}`
    : `${topic} · ${who.charAt(0).toLowerCase()}${who.slice(1)} on ${on}`;
}

/** The job "Apply it to what is already filed" sends (#342, handover D.2):
 * the agent walks the folders the rule names and moves or renames (#372). */
export function applyToFiledRequest(text: string): string {
  return `Apply this rule to what is already filed: ${oneLine(text)}`;
}
