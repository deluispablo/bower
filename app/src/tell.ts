/**
 * Pure helpers for the Tell Bower screen. No DOM, no fetch: unit-tested
 * directly. `instructionFileName` and `instructionNote` build the
 * `Bower - …md` instruction note the Instructions workflow reads
 * (`vault-template/CLAUDE.md`); the `sentItem` helpers keep a small local
 * history of what was sent, in `localStorage`; `statusLineFor` and the
 * display helpers below turn one of those items into the text a sent
 * bubble shows.
 */

import type { Run } from './api.js';
import type { RunPhase } from './run-store.js';

/** Characters not allowed in a Drive/Windows file name. */
const ILLEGAL_CHARS = /[\\/:*?"<>|]/g;
const MAX_TITLE_LENGTH = 60;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function sanitizeTitle(raw: string): string {
  return raw
    .trim()
    .replace(ILLEGAL_CHARS, '')
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
}

/** The first six whitespace-separated words of `text`, joined by a space. */
function firstSixWords(text: string): string {
  return text.trim().split(/\s+/).slice(0, 6).join(' ');
}

/**
 * `Bower - YYYY-MM-DD HHmm <title>.md`: the title is `title` when given
 * (trimmed), otherwise the first six words of `text`. Either way, characters
 * illegal in a file name are stripped and the title is capped at 60 chars.
 */
export function instructionFileName(
  text: string,
  title: string,
  now: Date,
): string {
  const rawTitle = title.trim() !== '' ? title : firstSixWords(text);
  const cleanTitle = sanitizeTitle(rawTitle);
  const datePart = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const timePart = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `Bower - ${datePart} ${timePart} ${cleanTitle}.md`;
}

/**
 * The Markdown content of an instruction note: frontmatter (`tags:
 * [instruction]`, `date`, `via: app`) followed by the text as written.
 */
export function instructionNote(text: string, now: Date): string {
  return `---\ntags: [instruction]\ndate: ${now.toISOString()}\nvia: app\n---\n\n${text.trim()}\n`;
}

// --- Sent list ---------------------------------------------------------

export interface SentItem {
  name: string;
  text: string;
  /** ISO-8601. */
  sentAt: string;
}

const SENT_KEY = 'bower.tell.sent';
const MAX_SENT = 50;

function isSentItem(value: unknown): value is SentItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<SentItem>).name === 'string' &&
    typeof (value as Partial<SentItem>).text === 'string' &&
    typeof (value as Partial<SentItem>).sentAt === 'string'
  );
}

/**
 * The locally kept 'sent' list, newest first. Never throws: a missing key,
 * invalid JSON or an unavailable `localStorage` all resolve to `[]`.
 */
export function loadSent(): SentItem[] {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSentItem) : [];
  } catch {
    // Storage blocked or the value is corrupt: treat it as an empty list.
    return [];
  }
}

/**
 * Adds `item` to the front of the 'sent' list, caps it at 50 entries, and
 * persists it. Returns the updated list even if persisting fails (a full or
 * unavailable `localStorage`); this function never throws.
 */
export function addSent(item: SentItem): SentItem[] {
  const list = [item, ...loadSent()].slice(0, MAX_SENT);
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(list));
  } catch {
    // Best effort: the caller still gets the up-to-date list to render.
  }
  return list;
}

/**
 * Drops the local 'sent' history. Per-user, so `forget.ts` calls this on
 * sign-out and account deletion. Never throws.
 */
export function clearSent(): void {
  try {
    localStorage.removeItem(SENT_KEY);
  } catch {
    // Storage blocked: nothing to remove.
  }
}

// --- Display helpers -----------------------------------------------------

/** The first line of `text`, shortened if it runs long. */
export function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? '';
  return line.length > 140 ? `${line.slice(0, 140)}…` : line;
}

/** A compact "sent at" label, e.g. "Sep 26, 14:05"; `''` for an invalid date. */
export function formatSentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Enough of the run store's state to caption a sent item: the phase, and
 * (for `done`) the run it belongs to, whose `finishedAt` decides whether
 * this particular item was part of it.
 */
export interface RunSnapshot {
  phase: RunPhase;
  run: Run | null;
}

/** Whether `a` (ISO-8601) is at or before `b`; `false` if either fails to parse. */
function isAtOrBefore(a: string, b: string): boolean {
  const aTime = Date.parse(a);
  const bTime = Date.parse(b);
  return !Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime <= bTime;
}

/**
 * The status line under a sent bubble (spec §6, Tell Bower row):
 *
 * - `queued` or `running`: "Tidying up…", for every item already in the
 *   list — whether it was sent before the run started or arrived while
 *   it was already going, either way it is (or will be) picked up.
 * - `done`: "Done" once the item was sent at or before the run's
 *   `finishedAt`, i.e. it was actually part of the run that just
 *   finished; an item sent after that (a message typed in the few
 *   seconds the "done" state lingers) falls through to the plain sent
 *   line below, since it wasn't.
 * - `idle`, `failed`, or anything else — `stale`, `quota`, a missing run
 *   snapshot, or a phase this function doesn't otherwise recognise —
 *   falls back to "Sent · <date>".
 */
export function statusLineFor(
  item: SentItem,
  runPhase: RunSnapshot | null | undefined,
): string {
  const sentLine = `Sent · ${formatSentDate(item.sentAt)}`;
  if (runPhase == null) return sentLine;

  switch (runPhase.phase) {
    case 'queued':
    case 'running':
      return 'Tidying up…';
    case 'done': {
      const finishedAt = runPhase.run?.finishedAt;
      return finishedAt !== undefined && isAtOrBefore(item.sentAt, finishedAt)
        ? 'Done'
        : sentLine;
    }
    default:
      return sentLine;
  }
}
