/**
 * Pure helpers behind the Bower tab (#340, spec C.7): the rotating examples
 * under the box, and Requests with each one's state (#344), derived from
 * the Bower folder: the inbox, the run in flight, `Answers/` and
 * `Rules.md`. No DOM, no Drive calls: unit-tested directly
 * (`test/bower-tab.test.ts`); `routes/bower.tsx` renders them.
 */

import { FOLDER_MIME } from './drive.js';
import type { DriveFile } from './drive.js';
import { relativeTime } from './navigation.js';
import { OWNER_ORIGIN, shortDay } from './rules.js';
import type { Rule } from './rules.js';
import { firstLine, instructionBody, isContextNote } from './tell.js';

/**
 * Sentences a person could send, in sets of three (a job, a rule, a
 * question, the board's order): the tip under the box shows one set at a
 * time and moves to the next one on every visit (`examplesFor`). Written as
 * a person would say them; none of them is a selector, tapping one only
 * fills the box.
 */
export const EXAMPLES: readonly string[] = [
  'Make a document that analyses the job offers I have saved',
  'From now on, receipts go under Finance, named by shop and date',
  'How much did I spend on the kitchen this year?',
  'Summarise the PDF I added today in three bullet points',
  'Always file recipes under Cooking and tag them #recipe',
  'What did I save about trip planning last month?',
  'Make a packing list for my next trip from my notes',
  'Never move anything out of Health',
  'When does my home insurance renew?',
];

const EXAMPLES_PER_SET = 3;

/** The three examples shown on visit number `turn` (0 for the first). */
export function examplesFor(turn: number): string[] {
  const sets = Math.floor(EXAMPLES.length / EXAMPLES_PER_SET);
  const set = ((Math.floor(turn) % sets) + sets) % sets;
  const start = set * EXAMPLES_PER_SET;
  return EXAMPLES.slice(start, start + EXAMPLES_PER_SET);
}

/** A sentence sent from the box on this screen, kept in memory until a
 * listing has its note (the listing cannot know about it before). */
export interface SentRequest {
  /** The instruction note's file name (`Bower - <date> <time> <title>.md`). */
  name: string;
  /** What the person wrote. */
  text: string;
  /** ISO-8601. */
  sentAt: string;
}

/** A rule sentence kept at once from this screen (#343), in memory: its
 * exact time, which `Rules.md` (a day only) does not have. */
export interface KeptSentence {
  text: string;
  /** ISO-8601. */
  since: string;
}

/**
 * Where a request stands (#344, spec C.7, board Phone-Bower-Requests):
 * waiting for the next tidy-up, in the run in flight, answered, or kept
 * as a rule.
 */
export type RequestState = 'waiting' | 'tidying' | 'answered' | 'kept';

export interface RequestRow {
  /** Unique within the list, and the same for a sentence before and
   * after the listing has its note (the row keeps its element). */
  key: string;
  state: RequestState;
  /** The sentence as the person wrote it (first line), the question an
   * answer is for, or the rule. */
  text: string;
  /** What the sentence is (`sentenceKind`); `context` for Add's "What is
   * this?" note (#335). */
  kind: SentenceKind | 'context';
  /** ISO-8601: when it was sent, answered, or kept (a rule's day, from
   * its start, when this screen did not keep it). */
  since: string;
  /** The Drive file behind the row: the instruction note (waiting,
   * tidying up) or the answer (answered); `null` for a rule, or for a
   * sentence the listing does not have yet. */
  fileId: string | null;
}

/** How Requests names Add's context note (#335): it is about a batch of
 * files, not a sentence to show. */
export const CONTEXT_TITLE = 'About the files you added';

/** `Bower - YYYY-MM-DD HHmm <title>.md`, as `instructionFileName` builds it. */
const REQUEST_NAME =
  /^Bower - (\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2}) (.+)\.md$/;

/** `YYYY-MM-DD <question>.md`, how the agent names an answer. */
const ANSWER_NAME = /^(\d{4})-(\d{2})-(\d{2}) (.+)\.md$/;

const INBOX = '0-Inbox';
const ANSWERS = 'Answers';

/** Local midnight of `YYYY`, `MM`, `DD` and, when given, `hh:mm`, as
 * ISO-8601; `null` when that is not a date. */
function localIso(
  year: string,
  month: string,
  day: string,
  hours = '0',
  minutes = '0',
): string | null {
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The date and time in an instruction note's name (local time), or `null`. */
function sinceFromName(match: RegExpMatchArray): string | null {
  const [, year = '', month = '', day = '', hours, minutes] = match;
  return localIso(year, month, day, hours, minutes);
}

/** A rule's `YYYY-MM-DD` as the start of that day, or `null`. */
function dayStart(day: string | null): string | null {
  const match = day === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) return null;
  const [, year = '', month = '', dd = ''] = match;
  return localIso(year, month, dd);
}

/**
 * The instruction notes still waiting: every `Bower - <date> <time>
 * <title>.md` file directly in `0-Inbox/` (a processed one has moved to
 * `0-Inbox/Processed/`). The Bower tab reads their words from these.
 */
export function waitingNotes(files: readonly DriveFile[]): DriveFile[] {
  return files.filter(
    (file) =>
      file.mimeType !== FOLDER_MIME &&
      file.path === `${INBOX}/${file.name}` &&
      REQUEST_NAME.test(file.name),
  );
}

export interface RequestsInput {
  /** The folder listing (`useVault().files`). */
  files: readonly DriveFile[];
  /** When that listing was fetched (ISO-8601), `null` before the first one. */
  fetchedAt: string | null;
  /** Instruction notes' content, by file id, for those read so far. */
  texts: ReadonlyMap<string, string>;
  /** Sent from this screen since it opened. */
  justSent: readonly SentRequest[];
  /** When the run in flight was asked for (ISO-8601), `null` when no run
   * is in flight. */
  runSince: string | null;
  /** Every rule in `Rules.md` (`allRules(parseRules(…))`), `[]` before it
   * is read. */
  rules: readonly Rule[];
  /** Rule sentences kept from this screen since it opened. */
  justKept: readonly KeptSentence[];
}

/**
 * Every request and what came of it, newest first (#344, spec C.7), all
 * derived from the Bower folder:
 * - an instruction note directly in `0-Inbox/` is **waiting** for the next
 *   tidy-up, or **tidying up** when it was there before the run in flight
 *   was asked for; its words come from the note (`texts`), else from what
 *   this screen sent, else from the title in its name;
 * - a note in `Answers/` named `YYYY-MM-DD <question>.md` is **answered**;
 * - a rule in `Rules.md` the owner asked for (`owner's request`, not
 *   paused) is **kept**.
 * Anything sent from this screen after the listing was fetched counts as
 * waiting until a listing fetched after it says otherwise, and a rule kept
 * from this screen shows even before `Rules.md` is read again.
 */
export function requestRows({
  files,
  fetchedAt,
  texts,
  justSent,
  runSince,
  rules,
  justKept,
}: RequestsInput): RequestRow[] {
  const sentByName = new Map(justSent.map((item) => [item.name, item]));
  const runMs = runSince === null ? null : Date.parse(runSince);
  const stateAt = (since: string): RequestState =>
    runMs !== null && Date.parse(since) <= runMs ? 'tidying' : 'waiting';
  const rows: RequestRow[] = [];
  const listed = new Set<string>();

  for (const file of waitingNotes(files)) {
    const match = REQUEST_NAME.exec(file.name);
    if (match === null) continue;
    listed.add(file.name);
    const note = texts.get(file.id);
    const sent = sentByName.get(file.name);
    const title = match[6] ?? file.name;
    const context =
      note === undefined ? title === 'Context' : isContextNote(note);
    const words =
      note === undefined ? (sent?.text ?? title) : instructionBody(note);
    const since =
      sent?.sentAt ?? sinceFromName(match) ?? file.modifiedTime ?? '';
    rows.push({
      key: `request-${file.name}`,
      state: stateAt(since),
      text: context ? CONTEXT_TITLE : firstLine(words),
      kind: context ? 'context' : sentenceKind(words),
      since,
      fileId: file.id,
    });
  }

  const fetchedMs = fetchedAt === null ? null : Date.parse(fetchedAt);
  for (const item of justSent) {
    if (listed.has(item.name)) continue;
    if (fetchedMs !== null && Date.parse(item.sentAt) <= fetchedMs) continue;
    listed.add(item.name);
    rows.push({
      key: `request-${item.name}`,
      state: stateAt(item.sentAt),
      text: firstLine(item.text),
      kind: sentenceKind(item.text),
      since: item.sentAt,
      fileId: null,
    });
  }

  for (const file of files) {
    if (file.mimeType === FOLDER_MIME) continue;
    if (file.path !== `${ANSWERS}/${file.name}`) continue;
    const match = ANSWER_NAME.exec(file.name);
    if (match === null) continue;
    const [, year = '', month = '', day = '', question = ''] = match;
    rows.push({
      key: `answer-${file.id}`,
      state: 'answered',
      text: question,
      kind: sentenceKind(question),
      since: file.modifiedTime ?? localIso(year, month, day) ?? '',
      fileId: file.id,
    });
  }

  const keptAt = new Map(justKept.map((item) => [item.text, item.since]));
  const inRules = new Set<string>();
  for (const rule of rules) {
    if (rule.paused || rule.origin?.toLowerCase() !== OWNER_ORIGIN) continue;
    inRules.add(rule.text);
    rows.push({
      key: `rule-${String(rule.line)}`,
      state: 'kept',
      text: rule.text,
      kind: 'rule',
      since: keptAt.get(rule.text) ?? dayStart(rule.date) ?? '',
      fileId: null,
    });
  }
  for (const [i, item] of justKept.entries()) {
    if (inRules.has(item.text)) continue;
    rows.push({
      key: `kept-${String(i)}`,
      state: 'kept',
      text: item.text,
      kind: 'rule',
      since: item.since,
      fileId: null,
    });
  }

  return rows.sort((a, b) => b.since.localeCompare(a.since));
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "just now", "5 min ago", "2 h ago", then `relativeTime`'s days and weeks. */
export function sinceLabel(iso: string, now: number | Date): string {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const thenMs = Date.parse(iso);
  if (Number.isNaN(thenMs)) return '';
  const diffMs = Math.max(0, nowMs - thenMs);
  if (diffMs < MINUTE_MS) return 'just now';
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)} min ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)} h ago`;
  return relativeTime(iso, nowMs);
}

/** What a sentence sent from the box is, by plain pattern (#343, handover
 * D.2): the app keeps a rule at once, the others wait for a run. */
export type SentenceKind = 'rule' | 'question' | 'job';

/** "From now on", "Always", "Never" or "Every time" as the first words,
 * any case, leading whitespace allowed. */
const RULE_START = /^\s*(?:from now on|always|never|every time)\b/i;

/**
 * A sentence ending in "?" is a question (checked first, so "Every time I
 * add a receipt, where does it go?" is asked, not kept); one starting with
 * "From now on", "Always", "Never" or "Every time" is a rule; everything
 * else is a job.
 */
export function sentenceKind(text: string): SentenceKind {
  const trimmed = text.trim();
  if (trimmed.endsWith('?')) return 'question';
  if (RULE_START.test(trimmed)) return 'rule';
  return 'job';
}

/**
 * The rule sentences in a longer text (#435, Add's "What is this?" box):
 * the text split into sentences (after `.`, `!` or `?`, and at line
 * breaks), keeping those `sentenceKind` reads as a rule, as written.
 */
export function ruleSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '' && sentenceKind(sentence) === 'rule');
}

/**
 * The state chip on a request (board Phone-Bower-Requests): `Waiting ·
 * job`, `Tidying up · question`, `Answered`, `Rule kept`. Add's context
 * note is about files, not a sentence, so its chip has no kind.
 */
export function stateLabel(row: Pick<RequestRow, 'state' | 'kind'>): string {
  const kind = row.kind === 'context' ? '' : ` · ${row.kind}`;
  switch (row.state) {
    case 'waiting':
      return `Waiting${kind}`;
    case 'tidying':
      return `Tidying up${kind}`;
    case 'answered':
      return 'Answered';
    case 'kept':
      return 'Rule kept';
    default: {
      const exhaustive: never = row.state;
      return exhaustive;
    }
  }
}

/** The day of `iso` on this device, as the Rules screen writes it
 * (`26 Sep`); empty for a date it cannot read. */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return shortDay(
    `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  );
}
