/**
 * Pure helpers for the Tell Bower screen. No DOM, no fetch: unit-tested
 * directly. `instructionFileName` and `instructionNote` build the
 * `Bower - …md` instruction note the Instructions workflow reads
 * (`vault-template/CLAUDE.md`); the `sentItem` helpers keep a small local
 * history of what was sent, in `localStorage`.
 */

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
