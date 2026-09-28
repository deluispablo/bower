/**
 * Pure helpers behind the Bower tab (#340, spec C.7): the rotating examples
 * under the box, and the requests still waiting for a tidy-up, read from
 * the inbox listing. No DOM, no Drive calls: unit-tested directly
 * (`test/bower-tab.test.ts`); `routes/bower.tsx` renders them.
 */

import { FOLDER_MIME } from './drive.js';
import type { DriveFile } from './drive.js';
import { relativeTime } from './navigation.js';
import { firstLine } from './tell.js';
import type { SentItem } from './tell.js';

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

/** A sentence sent from the box that no tidy-up has picked up yet. */
export interface WaitingRequest {
  /** The instruction note's file name (`Bower - <date> <time> <title>.md`). */
  name: string;
  /** What the person wrote (first line), or the note's title when this
   * device has no record of sending it. */
  text: string;
  /** ISO-8601: when it was sent, or the note's time when unknown. */
  since: string;
}

/** `Bower - YYYY-MM-DD HHmm <title>.md`, as `instructionFileName` builds it. */
const REQUEST_NAME =
  /^Bower - (\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2}) (.+)\.md$/;

const INBOX = '0-Inbox';

/** The date and time in the note's name (local time), or `null`. */
function sinceFromName(match: RegExpMatchArray): string | null {
  const [, year, month, day, hours, minutes] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface WaitingInput {
  /** The folder listing (`useVault().files`). */
  files: DriveFile[];
  /** When that listing was fetched (ISO-8601), `null` before the first one. */
  fetchedAt: string | null;
  /** This device's sent list (`loadSent()`), for the words as written. */
  sent: SentItem[];
  /** Sent from this screen since it opened: they count as waiting until a
   * listing fetched after them says otherwise. */
  justSent: SentItem[];
}

/**
 * The requests still waiting, newest first: every instruction note sitting
 * directly in `0-Inbox/` (a processed one has moved to
 * `0-Inbox/Processed/`), plus anything sent from this screen after the
 * listing was fetched, which the listing cannot know about yet.
 */
export function waitingRequests({
  files,
  fetchedAt,
  sent,
  justSent,
}: WaitingInput): WaitingRequest[] {
  const sentByName = new Map(sent.map((item) => [item.name, item]));
  const waiting: WaitingRequest[] = [];
  const listed = new Set<string>();

  for (const file of files) {
    if (file.mimeType === FOLDER_MIME) continue;
    if (file.path !== `${INBOX}/${file.name}`) continue;
    const match = REQUEST_NAME.exec(file.name);
    if (match === null) continue;
    listed.add(file.name);
    const item = sentByName.get(file.name);
    const since =
      item?.sentAt ?? file.modifiedTime ?? sinceFromName(match) ?? '';
    waiting.push({
      name: file.name,
      text: item === undefined ? (match[6] ?? file.name) : firstLine(item.text),
      since,
    });
  }

  const fetchedMs = fetchedAt === null ? null : Date.parse(fetchedAt);
  for (const item of justSent) {
    if (listed.has(item.name)) continue;
    if (fetchedMs !== null && Date.parse(item.sentAt) <= fetchedMs) continue;
    listed.add(item.name);
    waiting.push({
      name: item.name,
      text: firstLine(item.text),
      since: item.sentAt,
    });
  }

  return waiting.sort((a, b) => b.since.localeCompare(a.since));
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
